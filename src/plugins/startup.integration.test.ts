import { afterEach, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { buildPlugin } from "@asterism-app/plugin-build";
import { fixture, put } from "./artifact-fixtures.integration.ts";

const fixtures: Awaited<ReturnType<typeof fixture>>[] = [];
afterEach(() => { for (const f of fixtures.splice(0)) f.close(); });
async function setup() { const f = await fixture(); fixtures.push(f); return f; }
const source = (value: string, id = "snapshot") => `export default {namespace:{id:'fixture.${id}'},probe:${JSON.stringify(value)}};`;

it("loads the completed output across processes; source edits take effect only through an explicit build", async () => {
  const f = await setup();
  const directory = await f.plugin("snapshot", { runtime: "runtime.js" }, { "runtime.js": source("before") });
  await f.run(`add('snapshot');const built=await loader.buildPackages(list,root);loader.savePluginBuild(cache,built);`);
  put(directory, "runtime.js", source("after"));
  await f.run(`const [captured]=await loader.importPackages(loader.readPluginBuild(join(cache,'startup.json')),hostModules);
    assert.equal(captured.definition.probe,'before');`);
  await buildPlugin({ root: directory });
  await f.run(`const [next]=await loader.loadPackages(list,root,hostModules);assert.equal(next.definition.probe,'after');`);
});

it("a failed build leaves the previous completed output selected", async () => {
  const f = await setup();
  const directory = await f.plugin("kept", { runtime: "runtime.js" }, { "runtime.js": source("kept", "kept") });
  put(directory, "runtime.js", "this is not javascript !");
  await expect(buildPlugin({ root: directory })).rejects.toThrow();
  expect(readdirSync(directory).filter(name => name.startsWith(".asterism-build-"))).toEqual([]);
  await f.run(`add('kept');const [item]=await loader.loadPackages(list,root,hostModules);assert.equal(item.status,'ready',item.diagnostic?.message);assert.equal(item.definition.probe,'kept');`);
});

it("blocks storage-rejected public-only providers and consumers before runtime import while preserving unrelated packages", async () => {
  const f = await setup();
  await f.plugin("provider", { storage: "storage.ts", provides: { runtime: { "@fixture/api/public": "public.ts" } } }, {
    "storage.ts": "export default [{kind:'json',path:'state.json',version:2,migrations:{}}];",
    "public.ts": "export const value=1;",
  });
  await f.plugin("consumer", { runtime: "runtime.ts", peers: ["@fixture/api"] }, {
    "runtime.ts": "import '@fixture/api/public';throw new Error('Consumer must not execute');",
  });
  await f.plugin("independent", {});
  await f.run(`add('provider');add('consumer');add('independent');
    const built=await loader.buildPackages(list,root);
    const storage=await loader.importStorageEntries(built,hostModules);assert.equal(storage[0].storage[0].version,2);
    const items=await loader.importPackages(built,hostModules,{storageFailures:new Map([['fixture.provider','Migration failed.']])});
    assert.deepEqual(items.map(item=>[item.status,item.diagnostic?.stage]),[['failed','storage'],['failed','dependency'],['ready',undefined]]);
    assert.equal(items[1].definition,undefined);`);
});

it("runs the storage entry only in preparation and gives runtime the captured current format", async () => {
  const f = await setup();
  await f.plugin("state", { runtime: "runtime.ts", storage: "storage.ts" }, {
    "storage.ts": `if (process.env.ASTERISM_PHASE !== 'prepare') throw new Error('Storage entry executed in runtime');
      export default [{kind:'json',path:'state.json',version:2,migrations:{1:()=> 'converted'}}];`,
    "runtime.ts": source("runtime", "state"),
  });
  await f.run(`add('state');process.env.ASTERISM_PHASE='prepare';
    const [item]=await loader.importStorageEntries(await loader.buildPackages(list,root),hostModules);
    assert.equal(item.storage[0].migrations[1](),'converted');
    const { storage, ...built }=item;
    loader.savePluginBuild(cache,[{...built,preparedStorage:loader.currentStorage(storage)}]);`);
  await f.run(`const [item]=await loader.importPackages(loader.readPluginBuild(join(cache,'startup.json')),hostModules);
    assert.equal(item.definition.probe,'runtime');
    assert.deepEqual(item.preparedStorage,[{kind:'json',path:'state.json',version:2}]);`);
});
