import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
await build({ absWorkingDir: fileURLToPath(new URL('..', import.meta.url)), entryPoints: ['src/index.ts', 'src/artifact.ts', 'src/cli.ts'], outdir: 'dist', outExtension: { '.js': '.mjs' }, bundle: true, platform: 'node', target: 'node22', format: 'esm', packages: 'external' });
