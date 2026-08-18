import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = join(frontendRoot, 'node_modules', '@excalidraw', 'excalidraw', 'dist');

const patches = [
  {
    from: 'element.link && !appState.selectedElementIds[element.id]',
    to: '!element.link?.startsWith("beaver://") && element.link && !appState.selectedElementIds[element.id]',
  },
  {
    from: 'e.link&&!n.selectedElementIds[e.id]',
    to: '!e.link?.startsWith("beaver://")&&e.link&&!n.selectedElementIds[e.id]',
  },
  // Excalidraw 0.18.1 没有公开配置官方图片导出的 padding，
  // 将其内置默认值从 10px 调整为 100px，保留官方导出菜单和弹窗。
  {
    from: 'DEFAULT_EXPORT_PADDING = 10',
    to: 'DEFAULT_EXPORT_PADDING = 100',
  },
  {
    from: 'DEFAULT_EXPORT_PADDING=10',
    to: 'DEFAULT_EXPORT_PADDING=100',
  },
  {
    from: 'Cs=[1,2,3],Vi=10,OE=1440',
    to: 'Cs=[1,2,3],Vi=100,OE=1440',
  },
];

async function javascriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return javascriptFiles(path);
    return entry.isFile() && entry.name.endsWith('.js') ? [path] : [];
  }));
  return nested.flat();
}

const files = await javascriptFiles(distRoot);
let patchedFiles = 0;

for (const file of files) {
  let source = await readFile(file, 'utf8');
  let changed = false;

  for (const { from, to } of patches) {
    if (source.includes(to)) continue;
    if (!source.includes(from)) continue;
    source = source.replace(from, to);
    changed = true;
  }

  if (changed) {
    await writeFile(file, source);
    patchedFiles += 1;
  }
}

const alreadyPatched = await Promise.all(
  files.map(async file => (await readFile(file, 'utf8')).includes('startsWith("beaver://")')),
);

if (!alreadyPatched.some(Boolean)) {
  throw new Error('无法定位 Excalidraw 链接图标渲染逻辑，请检查依赖版本');
}

if (patchedFiles > 0) {
  process.stdout.write(`已修补 ${patchedFiles} 个 Excalidraw 构建文件\n`);
}
