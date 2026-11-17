import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, cp, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { buildPlugin } from '../dist/index.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'asterism-plugin-build-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
async function put(root, path, contents) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), contents);
}
async function manifest(root, id, build) {
  await put(root, 'package.json', JSON.stringify({ name: id, type: 'module', asterism: { id, artifact: 'dist/plugin.json', build } }));
}
const load = (build, path) => import(pathToFileURL(join(build.buildDirectory, path)).href);
async function files(root) {
  return (await Promise.all((await readdir(root, { withFileTypes: true })).map(async entry => entry.isDirectory()
    ? (await files(join(root, entry.name))).map(path => `${entry.name}/${path}`) : [entry.name]))).flat();
}

test('independent provider graphs share objects, classes and live exports with runtime, storage and two consumers in both realms', async t => {
  const root = await fixture(t);
  const provider = join(root, 'provider');
  await put(root, 'author-api/state.ts', 'export const state = {}; export class Token {}; export let count = 0; export function increment() { count++; }');
  await put(root, 'author-api/renderer.ts', 'export * from "./state.ts";');
  await manifest(provider, 'fixture.provider', {
    runtime: 'runtime.ts', storage: 'storage.ts', renderer: 'renderer.ts',
    public: { runtime: { '@fixture/api': '../author-api/state.ts' }, renderer: { '@fixture/api': '../author-api/renderer.ts' } },
  });
  for (const entry of ['runtime', 'storage', 'renderer']) await put(provider, `${entry}.ts`, 'export * from "@fixture/api";');
  const provided = await buildPlugin({ root: provider });
  const consumers = [];
  for (const name of ['one', 'two']) {
    const consumer = join(root, name);
    await manifest(consumer, `fixture.${name}`, { runtime: 'entry.ts', renderer: 'entry.ts', publicDependencies: ['@fixture/api'] });
    await put(consumer, 'entry.ts', 'import { state, Token, count, increment } from "@fixture/api"; export { state, Token, increment }; export const read = () => count;');
    await put(consumer, 'node_modules/@fixture/api/package.json', JSON.stringify({ name: '@fixture/api', type: 'module', exports: './index.js' }));
    await put(consumer, 'node_modules/@fixture/api/index.js', 'throw new Error("Consumer-private API must never be selected");');
    consumers.push(await buildPlugin({ root: consumer }));
  }
  for (const realm of ['runtime', 'renderer']) {
    const hooks = registerHooks({ resolve(specifier, context, next) {
      if (specifier === '@fixture/api') return { url: pathToFileURL(join(provided.buildDirectory, provided.artifact.public[realm]['@fixture/api'])).href, shortCircuit: true };
      return next(specifier, context);
    } });
    try {
      const api = await load(provided, provided.artifact.public[realm]['@fixture/api']);
      const implementation = await load(provided, provided.artifact[realm]);
      assert.equal(implementation.state, api.state);
      if (realm === 'runtime') assert.equal((await load(provided, provided.artifact.storage)).state, api.state);
      const loaded = await Promise.all(consumers.map(consumer => load(consumer, consumer.artifact[realm])));
      assert.equal(loaded[0].state, api.state);
      assert.equal(loaded[1].state, api.state);
      assert.ok(new loaded[0].Token() instanceof api.Token);
      assert.equal(loaded[1].read(), 0);
      api.increment();
      assert.equal(loaded[0].read(), 1);
      assert.equal(loaded[1].read(), 1);
    } finally { hooks.deregister(); }
  }
  assert.deepEqual(consumers[0].artifact.imports, { runtime: ['@fixture/api'], renderer: ['@fixture/api'] });
});

test('nested helpers record only used realm-specific host/public requests; public-only entries do not execute during build', async t => {
  const root = await fixture(t);
  await manifest(root, 'fixture.public', {
    public: { runtime: { '@fixture/api/runtime': 'runtime.ts' }, renderer: { '@fixture/api/renderer': 'renderer.ts' } },
    publicDependencies: ['@other/api', '@unused/api'],
  });
  await put(root, 'runtime.ts', 'export * from "./runtime-helper.ts"; throw new Error("Never execute at build time");');
  await put(root, 'runtime-helper.ts', 'export { external } from "@other/api/contracts"; export { z } from "zod"; export { definePlugin } from "@asterism-app/sdk/runtime";');
  await put(root, 'renderer.ts', 'export * from "./renderer-helper.ts"; throw new Error("Never execute at build time");');
  await put(root, 'renderer-helper.ts', 'export { Button } from "@asterism-app/ui/button"; export { external } from "@other/api/renderer"; export { createElement } from "react";');
  const result = await buildPlugin({ root });
  assert.deepEqual(result.artifact.imports.runtime, ['@asterism-app/sdk/runtime', '@other/api/contracts', 'zod']);
  assert.deepEqual(result.artifact.imports.renderer, ['@asterism-app/ui/button', '@other/api/renderer', 'react']);
  assert.equal(result.artifact.runtime, undefined);
  assert.equal(result.artifact.renderer, undefined);
  assert.deepEqual(Object.keys(result.artifact.public.runtime), ['@fixture/api/runtime']);
  assert.deepEqual(Object.keys(result.artifact.public.renderer), ['@fixture/api/renderer']);
});

test('renderer CommonJS dependencies consume host and provider ESM values without a browser require', async t => {
  const root = await fixture(t);
  await manifest(root, 'fixture.cjs-renderer', { renderer: 'entry.ts', publicDependencies: ['@fixture/api'],
    public: { renderer: { '@fixture/api/local': 'local.ts' } } });
  await put(root, 'entry.ts', 'export { state, Token, local, lazy } from "private-cjs";');
  await put(root, 'node_modules/private-cjs/package.json', JSON.stringify({ name: 'private-cjs', main: 'index.cjs' }));
  await put(root, 'node_modules/private-cjs/index.cjs', `
    exports.state = require("react").state;
    exports.Token = require("@fixture/api/contracts").Token;
    exports.local = require("@fixture/api/local").local;
    exports.lazy = () => import("./lazy.cjs");
  `);
  await put(root, 'node_modules/private-cjs/lazy.cjs', 'exports.state = require("react").state;');
  await put(root, 'node_modules/react/package.json', JSON.stringify({ name: 'react', main: 'index.cjs' }));
  await put(root, 'node_modules/react/index.cjs', 'throw new Error("Private React must not be bundled");');
  await put(root, 'local.ts', 'export const local = {};');
  await put(root, 'host.mjs', 'export const state = {}; export class Token {}');
  const result = await buildPlugin({ root });
  const hostUrl = pathToFileURL(await realpath(join(root, 'host.mjs'))).href;
  const host = await import(hostUrl);
  const hooks = registerHooks({ resolve(specifier, context, next) {
    if (specifier === 'react' || specifier === '@fixture/api/contracts') return { url: hostUrl, shortCircuit: true };
    return next(specifier, context);
  } });
  try {
    // Native ESM has no require, just like the browser. Loading executes the bundled CJS wrapper.
    const output = await load(result, result.artifact.renderer);
    assert.equal(output.state, host.state);
    assert.equal(output.local, (await load(result, result.artifact.public.renderer['@fixture/api/local'])).local);
    assert.ok(new output.Token() instanceof host.Token);
    assert.equal((await output.lazy()).state, host.state);
    assert.deepEqual(result.artifact.imports.renderer, ['@fixture/api/contracts', 'react']);
  } finally { hooks.deregister(); }
});

test('private external package specifiers remain relocatable and preserve import versus require conditions', async t => {
  const root = await fixture(t);
  const original = join(root, 'original');
  await manifest(original, 'fixture.private', { runtime: 'entry.ts', runtimeExternals: ['dual'] });
  await put(original, 'entry.ts', 'import { mode } from "dual"; export const imported = mode; export const required = require("dual").mode;');
  await put(original, 'node_modules/dual/package.json', JSON.stringify({ name: 'dual', type: 'module', exports: { import: './index.js', require: './index.cjs' } }));
  await put(original, 'node_modules/dual/index.js', 'export const mode = "import";');
  await put(original, 'node_modules/dual/index.cjs', 'exports.mode = "require";');
  const built = await buildPlugin({ root: original });
  const relocated = join(root, 'relocated');
  await cp(original, relocated, { recursive: true });
  await rm(original, { recursive: true });
  const selected = JSON.parse(await readFile(join(relocated, 'dist/plugin.json'), 'utf8'));
  const artifact = JSON.parse(await readFile(join(relocated, 'dist', selected.build, 'artifact.json'), 'utf8'));
  const result = await import(pathToFileURL(join(relocated, 'dist', selected.build, artifact.runtime)).href);
  assert.equal(result.imported, 'import'); assert.equal(result.required, 'require');
  assert.deepEqual(built.artifact.runtimeExternals, ['dual']);
  assert.deepEqual(built.artifact.imports.runtime, []);
  for (const path of (await files(join(relocated, 'dist'))).filter(path => path.endsWith('.mjs'))) {
    assert.ok(!(await readFile(join(relocated, 'dist', path), 'utf8')).includes(original));
  }
});

test('renderer CSS namespace includes plugin and stylesheet identity; public and lazy stylesheet closure is eager and deduped', async t => {
  const root = await fixture(t);
  const results = [];
  for (const id of ['one', 'two']) {
    const dir = join(root, id);
    await manifest(dir, `fixture.${id}`, { renderer: 'entry.ts', public: { renderer: { '@fixture/css': 'public.ts' } } });
    await put(dir, 'entry.ts', 'import css from "./one.module.css"; export const className = css.shared; export const lazy = () => import("./lazy.ts");');
    await put(dir, 'one.module.css', '.shared { color: red; }');
    await put(dir, 'public.ts', 'import css from "./two.module.css"; export const publicClassName = css.shared;');
    await put(dir, 'two.module.css', '.shared { color: blue; }');
    await put(dir, 'lazy.ts', 'import "./lazy.css"; export const value = 1;');
    await put(dir, 'lazy.css', '.lazy-only { color: green; }');
    const result = await buildPlugin({ root: dir });
    const entry = await load(result, result.artifact.renderer);
    const pub = await load(result, result.artifact.public.renderer['@fixture/css']);
    assert.notEqual(entry.className, pub.publicClassName);
    assert.ok(result.artifact.stylesheets.length > 0, 'CSS emitted after Vite generation must be recorded');
    assert.equal(new Set(result.artifact.stylesheets).size, result.artifact.stylesheets.length);
    const css = (await Promise.all(result.artifact.stylesheets.map(path => readFile(join(result.buildDirectory, path), 'utf8')))).join('\n');
    assert.ok(css.includes(entry.className)); assert.ok(css.includes(pub.publicClassName)); assert.ok(css.includes('.lazy-only'));
    await entry.lazy();
    results.push(entry.className);
  }
  assert.notEqual(results[0], results[1]);
});

test('URL directory assets retain sibling resources, normal URL imports and Vite workers are emitted', async t => {
  const root = await fixture(t);
  await manifest(root, 'fixture.assets', { renderer: 'entry.ts', assets: ['data'] });
  await put(root, 'entry.ts', 'import directory from "./resources/?url"; import file from "./resources/worker.js?url"; export { directory, file }; export const worker = () => new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });');
  await put(root, 'resources/worker.js', 'fetch("./nested/table.bin");');
  await put(root, 'resources/nested/table.bin', 'table-data');
  await put(root, 'worker.ts', 'postMessage("worker-payload");');
  await put(root, 'data/config.json', '{"copied":true}');
  const result = await buildPlugin({ root });
  const output = await load(result, result.artifact.renderer);
  assert.equal(await readFile(new URL('nested/table.bin', output.directory), 'utf8'), 'table-data');
  assert.equal(await readFile(new URL('worker.js', output.directory), 'utf8'), 'fetch("./nested/table.bin");');
  assert.equal(await readFile(new URL(output.file), 'utf8'), 'fetch("./nested/table.bin");');
  assert.equal(await readFile(join(result.buildDirectory, 'data/config.json'), 'utf8'), '{"copied":true}');
  assert.ok((await files(result.buildDirectory)).some(path => path.includes('worker-') && path.endsWith('.js')));
  for (const file of (await files(result.buildDirectory)).filter(path => /\.(?:mjs|js)$/u.test(path))) {
    const text = await readFile(join(result.buildDirectory, file), 'utf8');
    assert.ok(!text.includes(await realpath(root)), 'Virtual asset IDs must not leak author-machine paths into output comments');
  }
});

test('failed builds leave the successful pointer and old lazy graph untouched; later builds preserve old outputs', async t => {
  const root = await fixture(t);
  await manifest(root, 'fixture.publish', { runtime: 'entry.ts' });
  await put(root, 'entry.ts', 'export const lazy = () => import("./lazy.ts");');
  await put(root, 'lazy.ts', 'export const value = "old";');
  const first = await buildPlugin({ root });
  const captured = await load(first, first.artifact.runtime);
  const pointer = await readFile(first.pointerPath, 'utf8');
  await put(root, 'entry.ts', 'this is invalid javascript !');
  await assert.rejects(buildPlugin({ root }));
  assert.equal(await readFile(first.pointerPath, 'utf8'), pointer);
  await put(root, 'entry.ts', 'export const lazy = () => import("./lazy.ts");');
  await put(root, 'lazy.ts', 'export const value = "new";');
  const second = await buildPlugin({ root });
  assert.notEqual(first.artifact.buildId, second.artifact.buildId);
  assert.equal((await captured.lazy()).value, 'old');
  assert.equal((await (await load(second, second.artifact.runtime)).lazy()).value, 'new');
});


test('extensionless .node requests resolve to JavaScript while real native binaries require external ownership', async t => {
  const root = await fixture(t);
  await manifest(root, 'fixture.native', { runtime: 'entry.ts' });
  await put(root, 'entry.ts', 'export { value } from "./platform.node";');
  await put(root, 'platform.node.js', 'export const value = "javascript-platform-adapter";');
  const result = await buildPlugin({ root });
  assert.equal((await load(result, result.artifact.runtime)).value, 'javascript-platform-adapter');
  const pointer = await readFile(result.pointerPath, 'utf8');
  await put(root, 'entry.ts', 'import addon from "./addon.node"; export default addon;');
  await put(root, 'addon.node', 'not-a-real-binary');
  await assert.rejects(buildPlugin({ root }), /must remain inside a declared runtimeExternals package/u);
  assert.equal(await readFile(result.pointerPath, 'utf8'), pointer);
});


test('provider-installed authoring sources and nested own imports resolve through explicit public entries', async t => {
  const root = await fixture(t);
  await manifest(root, 'fixture.installed-provider', {
    runtime: 'entry.ts',
    public: { runtime: { '@fixture/installed/contracts': './node_modules/@fixture/installed/src/contracts.ts', '@fixture/installed/runtime': './node_modules/@fixture/installed/src/runtime.ts' } },
  });
  await put(root, 'entry.ts', 'export { singleton } from "@fixture/installed/runtime";');
  await put(root, 'node_modules/@fixture/installed/package.json', JSON.stringify({ name: '@fixture/installed', type: 'module', exports: { './contracts': './src/contracts.ts', './runtime': './src/runtime.ts' } }));
  await put(root, 'node_modules/@fixture/installed/src/contracts.ts', 'export const singleton = {};');
  await put(root, 'node_modules/@fixture/installed/src/runtime.ts', 'export { singleton } from "@fixture/installed/contracts";');
  const result = await buildPlugin({ root });
  const implementation = await load(result, result.artifact.runtime);
  const contracts = await load(result, result.artifact.public.runtime['@fixture/installed/contracts']);
  const runtime = await load(result, result.artifact.public.runtime['@fixture/installed/runtime']);
  assert.equal(implementation.singleton, contracts.singleton);
  assert.equal(runtime.singleton, contracts.singleton);
  assert.deepEqual(result.artifact.imports.runtime, []);
});


test('both executable realms reject imported test sources before publishing an artifact', async t => {
  for (const realm of ['runtime', 'renderer']) {
    const root = await fixture(t);
    await manifest(root, `fixture.${realm}`, { [realm]: 'entry.ts' });
    await put(root, 'entry.ts', 'import "./helper.test.ts"; export default {};');
    await put(root, 'helper.test.ts', 'globalThis.testCodeExecuted = true;');
    await assert.rejects(buildPlugin({ root }), /Runtime entry imports a test module/);
    await assert.rejects(readFile(join(root, 'dist/plugin.json')), { code: 'ENOENT' });
  }
});
