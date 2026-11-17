import { afterEach, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fixture, put } from "./artifact-fixtures.integration.ts";

const fixtures: Awaited<ReturnType<typeof fixture>>[] = [];
afterEach(() => { for (const f of fixtures.splice(0)) f.close(); });

it("keeps provider message ownership and renderer host export identities across plugin graphs", async () => {
  const f = await fixture(); fixtures.push(f);
  await f.plugin("messages", { provides: { renderer: { "@fixture/messages/public": "public.ts" } } }, {
    "public.ts": "import {pluginNamespace,defineMessages} from '@asterism-app/sdk/contracts';export const messages=pluginNamespace('fixture.messages').messages('en',defineMessages({title:{id:'title',defaultMessage:'Shared title'}}));",
  });
  await f.plugin("consumer", { renderer: "renderer.ts", peers: ["@fixture/messages"] }, {
    "renderer.ts": "export {messages} from '@fixture/messages/public';export {IntlProvider,useIntl} from 'react-intl';export default {modules:[]};",
  });
  await f.run(`add('messages');add('consumer');const items=await loader.loadPackages(list,root,hostModules);
    const {createRequire,registerHooks}=await import('node:module');
    // The page maps host specifiers to its own instances; here the host's installed modules stand in for them.
    const intlUrl=pathToFileURL(createRequire(${JSON.stringify(join(process.cwd(), "package.json"))}).resolve('react-intl')).href;
    const browserHost={'@asterism-app/sdk/contracts':hostModules['@asterism-app/sdk/contracts'],'react-intl':intlUrl};
    const intl=await import(intlUrl);
    const bindings=loader.rendererImportMap(items),roots=loader.artifactRoots(items);
    const hooks=registerHooks({resolve(specifier,context,next){
      if(browserHost[specifier])return {url:browserHost[specifier],shortCircuit:true};
      if(bindings[specifier]){const u=new URL(bindings[specifier]);return {url:pathToFileURL(join(roots[u.hostname],u.pathname)).href,shortCircuit:true};}
      return next(specifier,context);
    }});
    try{const renderer=await import(pathToFileURL(join(items[1].artifactRoot,items[1].artifact.renderer)).href);
      assert.equal(renderer.IntlProvider,intl.IntlProvider);assert.equal(renderer.useIntl,intl.useIntl);
      assert.equal(renderer.messages.title.owner,'fixture.messages');
    }finally{hooks.deregister();}`);
});

it("captures catalogs from owner-managed source files independently of executable output", async () => {
  const f = await fixture(); fixtures.push(f);
  const root = await f.plugin("catalog", { runtime: "runtime.ts" }, { "runtime.ts": "export default {namespace:{id:'fixture.catalog'}};" });
  const metadata = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  metadata.asterism.i18n = { catalogs: { "zh-Hans": "locales/zh.json" } };
  put(root, "package.json", JSON.stringify(metadata));
  put(root, "locales/zh.json", JSON.stringify({ limit: "上限", broken: "{bad" }));
  await f.run(`add('catalog');const [item]=await loader.loadPackages(list,root,hostModules);
    assert.equal(item.status,'ready');assert.deepEqual(item.catalogs[0].messages,{limit:'上限'});
    writeFileSync(join(root,'catalog/locales/zh.json'),JSON.stringify({limit:'最大数量'}));
    const [next]=await loader.loadPackages(list,root,hostModules);
    assert.notEqual(next.catalogs[0].revision,item.catalogs[0].revision);
    assert.deepEqual(next.catalogs[0].messages,{limit:'最大数量'});`);
});
