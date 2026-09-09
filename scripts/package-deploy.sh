#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT="$ROOT_DIR/deploy-package-new.tar.gz"
BASE_PACKAGE="$ROOT_DIR/deploy-package-new.tar.gz"
VERIFY_MODE="fast"

usage() {
  printf '%s\n' "Usage: scripts/package-deploy.sh [--verify fast|full|none] [--base PATH] [--output PATH]"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --verify)
      VERIFY_MODE="${2:-}"
      shift 2
      ;;
    --base)
      BASE_PACKAGE="${2:-}"
      shift 2
      ;;
    --output)
      OUTPUT="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage
      exit 2
      ;;
  esac
done

case "$VERIFY_MODE" in
  fast|full|none) ;;
  *)
    printf '%s\n' "Invalid verify mode: $VERIFY_MODE" >&2
    exit 2
    ;;
esac

if [ ! -f "$BASE_PACKAGE" ]; then
  printf '%s\n' "Base deploy package not found: $BASE_PACKAGE" >&2
  exit 1
fi

STAGE_ROOT="$(mktemp -d /tmp/miniflowy-deploy.XXXXXX)"
BASE_COPY="$STAGE_ROOT/base.tar.gz"
cp "$BASE_PACKAGE" "$BASE_COPY"
tar -xzf "$BASE_COPY" -C "$STAGE_ROOT"
STAGE_DEPLOY="$STAGE_ROOT/deploy"

if [ ! -d "$STAGE_DEPLOY" ]; then
  printf '%s\n' "Base package must contain deploy/ at archive root." >&2
  exit 1
fi

copy_file_if_exists() {
  local source="$1"
  local target="$2"
  if [ -f "$source" ]; then
    cp -a "$source" "$target"
  fi
}

copy_glob_if_exists() {
  local target_dir="$1"
  shift
  local found=0
  for pattern in "$@"; do
    for source in $pattern; do
      if [ -e "$source" ]; then
        cp -a "$source" "$target_dir/"
        found=1
      fi
    done
  done
  return "$found"
}

normalize_deploy_compose() {
  local compose_file="$STAGE_DEPLOY/docker-compose.yml"
  copy_file_if_exists "$ROOT_DIR/docker-compose.yml" "$compose_file"
  if [ -f "$compose_file" ]; then
    sed -i 's#\./backend/data:/app/data#./data:/app/data#g' "$compose_file"
  fi
}

printf '%s\n' "Overlay backend source..."
mkdir -p "$STAGE_DEPLOY/backend"
rm -rf "$STAGE_DEPLOY/backend/app"
cp -a "$ROOT_DIR/backend/app" "$STAGE_DEPLOY/backend/app"
copy_file_if_exists "$ROOT_DIR/backend/Dockerfile" "$STAGE_DEPLOY/backend/Dockerfile"
copy_file_if_exists "$ROOT_DIR/backend/requirements.txt" "$STAGE_DEPLOY/backend/requirements.txt"
copy_file_if_exists "$ROOT_DIR/backend/start.sh" "$STAGE_DEPLOY/backend/start.sh"
copy_glob_if_exists "$STAGE_DEPLOY/backend" "$ROOT_DIR"/backend/migrate_*.py "$ROOT_DIR"/backend/migrate_*.sh "$ROOT_DIR"/backend/migrate_*.sql || true

printf '%s\n' "Overlay frontend source..."
mkdir -p "$STAGE_DEPLOY/frontend"
rm -rf "$STAGE_DEPLOY/frontend/src" "$STAGE_DEPLOY/frontend/public" "$STAGE_DEPLOY/frontend/scripts"
cp -a "$ROOT_DIR/frontend/src" "$STAGE_DEPLOY/frontend/src"
cp -a "$ROOT_DIR/frontend/public" "$STAGE_DEPLOY/frontend/public"
cp -a "$ROOT_DIR/frontend/scripts" "$STAGE_DEPLOY/frontend/scripts"
copy_file_if_exists "$ROOT_DIR/frontend/Dockerfile" "$STAGE_DEPLOY/frontend/Dockerfile"
copy_file_if_exists "$ROOT_DIR/frontend/package.json" "$STAGE_DEPLOY/frontend/package.json"
copy_file_if_exists "$ROOT_DIR/frontend/package-lock.json" "$STAGE_DEPLOY/frontend/package-lock.json"
copy_file_if_exists "$ROOT_DIR/frontend/index.html" "$STAGE_DEPLOY/frontend/index.html"
copy_file_if_exists "$ROOT_DIR/frontend/vite.config.ts" "$STAGE_DEPLOY/frontend/vite.config.ts"
copy_file_if_exists "$ROOT_DIR/frontend/tsconfig.json" "$STAGE_DEPLOY/frontend/tsconfig.json"
copy_file_if_exists "$ROOT_DIR/frontend/tsconfig.app.json" "$STAGE_DEPLOY/frontend/tsconfig.app.json"
copy_file_if_exists "$ROOT_DIR/frontend/tsconfig.node.json" "$STAGE_DEPLOY/frontend/tsconfig.node.json"
copy_file_if_exists "$ROOT_DIR/frontend/eslint.config.js" "$STAGE_DEPLOY/frontend/eslint.config.js"
copy_file_if_exists "$ROOT_DIR/frontend/nginx.conf" "$STAGE_DEPLOY/frontend/nginx.conf"
copy_file_if_exists "$ROOT_DIR/frontend/postcss.config.js" "$STAGE_DEPLOY/frontend/postcss.config.js"

printf '%s\n' "Overlay nginx source..."
mkdir -p "$STAGE_DEPLOY/nginx"
copy_file_if_exists "$ROOT_DIR/nginx/Dockerfile" "$STAGE_DEPLOY/nginx/Dockerfile"
copy_file_if_exists "$ROOT_DIR/nginx/nginx.conf" "$STAGE_DEPLOY/nginx/nginx.conf"

printf '%s\n' "Normalize deploy compose..."
normalize_deploy_compose

printf '%s\n' "Clean generated files..."
find "$STAGE_DEPLOY" -type d -name '__pycache__' -prune -exec rm -rf {} +
find "$STAGE_DEPLOY" -type f \( -name '*.pyc' -o -name '.DS_Store' \) -delete

printf '%s\n' "Create package..."
TMP_OUTPUT="$STAGE_ROOT/package.tar.gz"
tar --sort=name --mtime='UTC 2026-01-01' --owner=0 --group=0 --numeric-owner -cf - -C "$STAGE_ROOT" deploy | gzip -n > "$TMP_OUTPUT"
mv "$TMP_OUTPUT" "$OUTPUT"

require_in_package() {
  local path="$1"
  if ! tar -tzf "$OUTPUT" | grep -Fx "$path" >/dev/null; then
    printf '%s\n' "Missing required package path: $path" >&2
    exit 1
  fi
}

assert_clean_package() {
  local matches
  matches="$(tar -tzf "$OUTPUT" | grep -E 'frontend/public/public|(^|/)(app\.db|uploads|__pycache__|\.pyc$|\.git/)' || true)"
  if [ -n "$matches" ]; then
    printf '%s\n' "Package contains forbidden paths:" >&2
    printf '%s\n' "$matches" >&2
    exit 1
  fi
}

map_source_to_package_path() {
  local source_path="$1"
  case "$source_path" in
    backend/app/*) printf 'deploy/%s\n' "$source_path" ;;
    backend/Dockerfile|backend/requirements.txt|backend/start.sh) printf 'deploy/%s\n' "$source_path" ;;
    backend/migrate_*) printf 'deploy/%s\n' "$source_path" ;;
    docker-compose.yml) printf 'deploy/docker-compose.yml\n' ;;
    frontend/src/*) printf 'deploy/%s\n' "$source_path" ;;
    frontend/public/*) printf 'deploy/%s\n' "$source_path" ;;
    frontend/scripts/*) printf 'deploy/%s\n' "$source_path" ;;
    frontend/Dockerfile|frontend/package.json|frontend/package-lock.json|frontend/index.html|frontend/vite.config.ts|frontend/tsconfig.json|frontend/tsconfig.app.json|frontend/tsconfig.node.json|frontend/eslint.config.js|frontend/nginx.conf|frontend/postcss.config.js) printf 'deploy/%s\n' "$source_path" ;;
    nginx/Dockerfile|nginx/nginx.conf) printf 'deploy/%s\n' "$source_path" ;;
  esac
}

verify_changed_files_included() {
  local range
  local changed
  local package_path
  if git -C "$ROOT_DIR" rev-parse --verify HEAD^ >/dev/null 2>&1; then
    range="HEAD^..HEAD"
    changed="$(git -C "$ROOT_DIR" diff --name-only "$range")"
  else
    changed="$(git -C "$ROOT_DIR" diff --name-only HEAD)"
  fi

  if [ -n "$(git -C "$ROOT_DIR" status --porcelain)" ]; then
    changed="$changed
$(git -C "$ROOT_DIR" diff --name-only HEAD)"
  fi

  printf '%s\n' "Check changed package-scoped files..."
  printf '%s\n' "$changed" | sort -u | while IFS= read -r source_path; do
    [ -n "$source_path" ] || continue
    package_path="$(map_source_to_package_path "$source_path" || true)"
    [ -n "$package_path" ] || continue
    require_in_package "$package_path"
    printf '  included %s\n' "$package_path"
  done
}

if [ "$VERIFY_MODE" != "none" ]; then
  assert_clean_package
  require_in_package "deploy/docker-compose.yml"
  require_in_package "deploy/backend/app/migrations.py"
  require_in_package "deploy/backend/Dockerfile"
  require_in_package "deploy/frontend/Dockerfile"
  require_in_package "deploy/frontend/package.json"
  require_in_package "deploy/frontend/src/main.tsx"
  verify_changed_files_included
fi

if [ "$VERIFY_MODE" = "full" ]; then
  docker compose -f "$STAGE_DEPLOY/docker-compose.yml" config >/dev/null
  docker build -t miniflowy-backend-package-test "$STAGE_DEPLOY/backend"
  docker build -t miniflowy-frontend-package-test "$STAGE_DEPLOY/frontend"
  docker build -t miniflowy-nginx-package-test "$STAGE_DEPLOY/nginx"
fi

printf '%s\n' "Package: $OUTPUT"
sha256sum "$OUTPUT"
ls -lh "$OUTPUT"
printf '%s\n' "Staging: $STAGE_ROOT"
