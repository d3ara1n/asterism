import { afterEach, describe, it } from "vitest";
import { fixture } from "./artifact-fixtures.integration.ts";

const fixtures: Awaited<ReturnType<typeof fixture>>[] = [];
afterEach(() => { for (const f of fixtures.splice(0)) f.close(); });
async function setup() {
  const f = await fixture(); fixtures.push(f);
  await f.plugin("provider", {
    runtime: "runtime.ts", renderer: "renderer.ts",
    public: { runtime: { "@fixture/api/contracts": "public.ts", "@fixture/api/relay": "relay.ts" },
      renderer: { "@fixture/api/contracts": "public.ts", "@fixture/api/relay": "relay.ts" } },
  }, {
    "public.ts": "export const registry=new Set();export class Token{};export let count=0;export function increment(){count++;}",
    "relay.ts": "export {registry,Token,count,increment} from '@fixture/api/contracts';",
    "runtime.ts": "import {registry,Token} from '@fixture/api/contracts';export default {namespace:{id:'fixture.provider'},probe:{registry,Token}};",
    "renderer.ts": "export {registry,Token,count,increment} from '@fixture/api/relay';export default {modules:[]};",
  });
  for (const name of ["one", "two"]) await f.plugin(name, {
    runtime: "runtime.ts", renderer: "renderer.ts", publicDependencies: ["@fixture/api"],
  }, {
    "runtime.ts": `import {registry,Token,count,increment} from '@fixture/api/relay';
      export {count,increment};export default {namespace:{id:'fixture.${name}'},probe:{registry,Token,count:()=>count}};`,
    "renderer.ts": "export {registry,Token,count,increment} from '@fixture/api/contracts';export default {modules:[]};",
    "node_modules/@fixture/api/package.json": JSON.stringify({ name: "@fixture/api", type: "module", exports: { "./contracts": "./private.js", "./relay": "./private.js" } }),
    "node_modules/@fixture/api/private.js": "throw new Error('A consumer-private public copy must never execute');",
  });
  return f;
}

describe("Native plugin-public ESM linking", () => {
  it("preserves provider ownership, mutable live bindings, re-exports, registration state, and class identity", async () => {
    const f = await setup();
    await f.run(`add('one');add('provider');add('two');const items=await loader.loadPackages(list,root,cache,[]);
      assert.deepEqual(items.map(item=>item.status),['ready','ready','ready']);
      const [one,provider,two]=items.map(item=>item.definition.probe);
      assert.equal(one.registry,provider.registry);assert.equal(two.Token,provider.Token);
      const a=await import(pathToFileURL(items[0].runtime).href),b=await import(pathToFileURL(items[2].runtime).href);
      assert.equal(a.count,0);a.increment();assert.equal(a.count,1);assert.equal(b.count,1);assert.equal(two.count(),1);
      one.registry.add('shared');assert.deepEqual([...two.registry],['shared']);
      assert.deepEqual(items[0].runtimeDependencies,['fixture.provider']);`);
  });

  it("keeps browser and backend native ESM graphs independent while each browser consumer shares its provider", async () => {
    const f = await setup();
    await f.run(`add('provider');add('one');add('two');const items=await loader.loadPackages(list,root,cache,[]);
      const bindings=loader.rendererImportMap(items),roots=loader.artifactRoots(items);
      // Node's native linker exercises the emitted browser ESM in a separate realm graph without a GUI/timing smoke test.
      const {registerHooks}=await import('node:module');
      const hooks=registerHooks({resolve(specifier,context,next){
        const bound=bindings[specifier];
        if(bound){const u=new URL(bound);return {url:pathToFileURL(join(roots[u.hostname],u.pathname)).href,shortCircuit:true};}
        return next(specifier,context);
      }});
      try {
        const browser=await Promise.all(items.map(item=>import(pathToFileURL(join(item.artifactRoot,item.artifact.renderer)).href)));
        assert.equal(browser[0].registry,browser[1].registry);assert.equal(browser[1].Token,browser[2].Token);
        assert.notEqual(browser[0].registry,items[0].definition.probe.registry);
        browser[0].increment();assert.equal(browser[1].count,1);assert.equal(browser[2].count,1);
        assert.equal(items[1].definition.probe.count(),0);
      }finally{hooks.deregister();}`);
  });

  it("rejects disabled providers without falling back to consumer-private copies", async () => {
    const f = await setup();
    await f.run(`add('provider');add('one');add('two');list.setEnabled(0,false);
      const items=await loader.loadPackages(list,root,cache,[]);
      assert.deepEqual(items.map(item=>item.status),['disabled','failed','failed']);
      assert.match(items[1].diagnostic.message,/no available enabled provider/);`);
  });

  it("rejects conflicting providers and propagates failure through consumers", async () => {
    const f = await setup();
    await f.plugin("duplicate", { public: { runtime: { "@fixture/api/contracts": "public.ts" } } }, { "public.ts": "export const registry=new Set();" });
    await f.run(`add('provider');add('one');add('duplicate');
      const items=await loader.loadPackages(list,root,cache,[]);
      assert.deepEqual(items.map(item=>item.status),['failed','failed','failed']);
      assert.match(items[0].diagnostic.message,/Multiple plugins provide/);`);
  });

  it.each(["runtime", "renderer"] as const)("rejects package ownership split across disjoint %s subpaths", async realm => {
    const f = await fixture(); fixtures.push(f);
    await f.plugin("contracts", { public: { runtime: { "@fixture/split/contracts": "public.ts" } } }, {
      "public.ts": "export class Token{};",
    });
    await f.plugin("implementation", { public: { [realm]: { "@fixture/split/implementation": "public.ts" } } }, {
      "public.ts": "class Token{};export const token=new Token();",
    });
    await f.plugin("consumer", { runtime: "runtime.ts", publicDependencies: ["@fixture/split"] }, {
      "runtime.ts": "import {Token} from '@fixture/split/contracts';export default {namespace:{id:'fixture.consumer'},probe:Token};",
    });
    await f.plugin("independent", {});
    await f.run(`add('contracts');add('implementation');add('consumer');add('independent');
      const items=await loader.loadPackages(list,root,cache,[]);
      assert.deepEqual(items.map(item=>item.status),['failed','failed','failed','ready']);
      assert.match(items[0].diagnostic.message,/Multiple plugins provide public package/);`);
  });

  it("does not execute unused public entries and links required public entries normally", async () => {
    const f = await fixture(); fixtures.push(f);
    await f.plugin("provider", { public: { runtime: { "@fixture/lazy/used": "used.ts", "@fixture/lazy/unused": "unused.ts" } } }, {
      "used.ts": "export const value=7;",
      "unused.ts": "throw new Error('Unused public entry executed');export const unused=1;",
    });
    await f.plugin("consumer", { runtime: "runtime.ts", publicDependencies: ["@fixture/lazy"] }, {
      "runtime.ts": "import {value} from '@fixture/lazy/used';export default {namespace:{id:'fixture.consumer'},probe:value};",
    });
    await f.run(`add('consumer');add('provider');const items=await loader.loadPackages(list,root,cache,[]);
      assert.deepEqual(items.map(item=>item.status),['ready','ready']);assert.equal(items[0].definition.probe,7);`);
  });

  it("propagates a provider runtime failure before earlier-listed consumers execute", async () => {
    const f = await fixture(); fixtures.push(f);
    await f.plugin("provider", { runtime: "runtime.ts", public: { runtime: { "@fixture/failure/contracts": "public.ts" } } }, {
      "public.ts": "export const value=1;", "runtime.ts": "throw new Error('Provider failed');",
    });
    await f.plugin("consumer", { runtime: "runtime.ts", publicDependencies: ["@fixture/failure"] }, { "runtime.ts": "import '@fixture/failure/contracts';throw new Error('Consumer executed');" });
    await f.run(`add('consumer');add('provider');const items=await loader.loadPackages(list,root,cache,[]);
      assert.equal(items[1].diagnostic.stage,'import');assert.match(items[1].diagnostic.message,/Provider failed/);
      assert.equal(items[0].diagnostic.stage,'dependency');assert.equal(items[0].definition,undefined);`);
  });
  it("keeps reverse browser dependencies out of backend setup order", async () => {
    const f = await fixture(); fixtures.push(f);
    await f.plugin("a", { runtime: "runtime.ts", publicDependencies: ["@fixture/b"], public: { renderer: { "@fixture/a/browser": "browser.ts" } } }, {
      "runtime.ts": "import {value} from '@fixture/b/contracts';export default {namespace:{id:'fixture.a'},probe:value};",
      "browser.ts": "export const value='browser';",
    });
    await f.plugin("b", { runtime: "runtime.ts", renderer: "renderer.ts", publicDependencies: ["@fixture/a"], public: { runtime: { "@fixture/b/contracts": "public.ts" } } }, {
      "runtime.ts": "export default {namespace:{id:'fixture.b'}};",
      "public.ts": "export const value='backend';",
      "renderer.ts": "export {value} from '@fixture/a/browser';export default {modules:[]};",
    });
    await f.run(`add('a');add('b');const items=await loader.loadPackages(list,root,cache,[]);
      assert.deepEqual(items.map(item=>item.status),['ready','ready']);
      assert.deepEqual(items[0].dependencies,['fixture.b']);assert.deepEqual(items[1].dependencies,['fixture.a']);
      assert.deepEqual([...loader.runtimeDependencies(items)],[['fixture.a',['fixture.b']],['fixture.b',[]]]);`);
  });

});
