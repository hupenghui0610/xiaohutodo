import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const output = path.join(root, '.pages-dist');
const staticFiles = [
  'auth-ui.js',
  'd1-storage.js',
  'feature-tabs.js',
  'icon.ico',
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of staticFiles) {
  await cp(path.join(root, file), path.join(output, file));
}

const version = process.env.DEPLOY_VERSION || 'local';
const html = await readFile(path.join(root, 'index.html'), 'utf8');
await writeFile(
  path.join(output, 'index.html'),
  html.replaceAll('{{DEPLOY_VERSION}}', version),
  'utf8'
);
