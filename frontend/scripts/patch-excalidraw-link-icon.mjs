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
