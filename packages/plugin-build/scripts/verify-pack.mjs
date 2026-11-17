import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const result = execFileSync(process.execPath, [process.env.npm_execpath, 'pack', '--dry-run', '--ignore-scripts', '--json'], {
  cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8',
});
const [packed] = Object.values(JSON.parse(result));
const files = new Set(packed.files.map(file => file.path));
for (const path of ['package.json', 'README.md', 'dist/index.mjs', 'dist/index.d.ts', 'dist/artifact.mjs', 'dist/artifact.d.ts', 'dist/cli.mjs']) {
  assert.ok(files.has(path), `Packed package is missing ${path}`);
}
assert.ok(![...files].some(path => path.startsWith('src/') || path.startsWith('test/')), 'Published tool contains build output rather than source fixtures');
console.log(`Verified ${packed.filename}: ${files.size} files`);
