import { afterEach, describe, it } from "vitest";
import { fixture, put } from "./artifact-fixtures.integration.ts";

const fixtures: Awaited<ReturnType<typeof fixture>>[] = [];
afterEach(() => { for (const fixture of fixtures.splice(0)) fixture.close(); });
async function setup() { const f = await fixture(); fixtures.push(f); return f; }
const runtime = (id: string, extra = "") => `import {pluginNamespace} from '@asterism-app/sdk/contracts';
import {definePlugin} from '@asterism-app/sdk/runtime'; ${extra}
export default {...definePlugin({namespace:pluginNamespace(${JSON.stringify(id)})}), probe: typeof probe === 'undefined' ? undefined : probe};`;

describe("Prebuilt package loading in a native Node process", () => {
  it("keeps the host SDK and Zod values canonical without imposing peer-version admission", async () => {
    const f = await setup();
    await f.plugin("identity", { runtime: "runtime.ts" }, { "runtime.ts": runtime("fixture.identity", `
      import {z} from 'zod'; import * as sdk from '@asterism-app/sdk/contracts';
      const probe = {z, namespace:sdk.pluginNamespace};`) }, { peerDependencies: { "@asterism-app/sdk": "^0.1.0" } });
    await f.run(`add('identity');
      const [item] = await loader.loadPackages(list,root,cache,[]);
      assert.equal(item.status,'ready',item.diagnostic?.message);
      assert.equal(item.definition.probe.z, loader.sharedRuntimeModules.zod.z);
      assert.equal(item.definition.probe.namespace, loader.sharedRuntimeModules['@asterism-app/sdk/contracts'].pluginNamespace);`);
  });

  it("does not compile missing output or execute source while preserving unrelated packages", async () => {
    const f = await setup();
    await f.plugin("healthy", { runtime: "runtime.ts" }, { "runtime.ts": runtime("fixture.healthy") });
    put(f.root, "missing/package.json", JSON.stringify({ name: "@fixture/missing", asterism: { id: "fixture.missing", displayName: "Missing", artifact: "dist/plugin.json", build: { runtime: "runtime.ts" } } }));
    put(f.root, "missing/runtime.ts", "throw new Error('Source must not execute');");
    await f.run(`writeFileSync(join(root,'plugins.json'),JSON.stringify({version:2,packages:[{source:{kind:'path',path:join(root,'missing')},enabled:true}]}));add('healthy');
      const items=await loader.loadPackages(list,root,cache,[]);
      assert.deepEqual(items.map(item=>item.status),['failed','ready']);
      assert.match(items[0].diagnostic.message,/ENOENT/);
      assert.equal(existsSync(join(root,'missing/dist')),false);`);
  });

  it("resolves movable private external packages using import and require conditions at the original package root", async () => {
    const f = await setup();
    await f.plugin("externals", { runtime: "runtime.ts", runtimeExternals: ["conditional"] }, {
      "runtime.ts": runtime("fixture.externals", `import {createRequire} from 'node:module';
        import {value} from 'conditional'; const requirePrivate=createRequire(import.meta.url);
        const probe={esm:value,cjs:requirePrivate('conditional').value};`),
      "node_modules/conditional/package.json": JSON.stringify({ name: "conditional", type: "module", exports: { import: "./esm.js", require: "./cjs.cjs" } }),
      "node_modules/conditional/esm.js": "export const value='import';",
      "node_modules/conditional/cjs.cjs": "exports.value='require';",
    });
    await f.run(`add('externals');const [item]=await loader.loadPackages(list,root,cache,[]);
      assert.equal(item.status,'ready',item.diagnostic?.message);
      assert.deepEqual(item.definition.probe,{esm:'import',cjs:'require'});`);
  });

  it("validates descriptor identity and file paths before executing any entries", async () => {
    const f = await setup();
    await f.plugin("invalid", { runtime: "runtime.ts" }, { "runtime.ts": "throw new Error('Must not execute');" });
    await f.run(`add('invalid');
      const pointer=JSON.parse(readFileSync(join(root,'invalid/dist/plugin.json'),'utf8'));
      const file=join(root,'invalid/dist',pointer.build,'artifact.json');
      const artifact=JSON.parse(readFileSync(file,'utf8'));artifact.id='fixture.wrong';writeFileSync(file,JSON.stringify(artifact));
      const [item]=await loader.loadPackages(list,root,cache,[]);
      assert.equal(item.status,'failed');assert.match(item.diagnostic.message,/does not match/);`);
  });

  it("uses the same completed artifact contract for isolated npm installations and legacy npm roots", async () => {
    const f = await setup();
    await f.plugin("managed", { runtime: "runtime.ts" }, { "runtime.ts": runtime("fixture.managed") });
    await f.run(`const {cpSync,mkdirSync}=await import('node:fs');
      for(const directory of ['installations/abc/node_modules/@fixture/managed','node_modules/@fixture/managed']) {
        mkdirSync(join(root,directory),{recursive:true});cpSync(join(root,'managed'),join(root,directory),{recursive:true});
      }
      list.add({source:{kind:'npm',name:'@fixture/managed',version:'1.0.0',installation:'abc'}},root);
      assert.equal((await loader.loadPackages(list,root,cache,[]))[0].status,'ready');
      list.replace(0,{source:{kind:'npm',name:'@fixture/managed',version:'1.0.0'},enabled:true},root);
      assert.equal((await loader.loadPackages(list,root,cache,[]))[0].status,'ready');`);
  });
});
