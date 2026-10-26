/** 公共包元数据不携带业务实现；两个运行环境各自绑定已加载的导出。 */
export type ModuleRealm = "runtime" | "renderer";
export type ModuleExports = Readonly<Record<string, unknown>>;
export interface PublicProvider {
  name: string;
  version: string;
  pluginId: string;
  modules: Partial<Record<ModuleRealm, Readonly<Record<string, readonly string[]>>>>;
}
const registryKey = "__asterismPublicModules";
type Binding = { version: string; pluginId: string; modules: Readonly<Record<string, ModuleExports>> };
type Registry = Partial<Record<ModuleRealm, Record<string, Binding>>>;

/** 应用在加载消费者前绑定，返回仅移除本次绑定的清理函数。公共导出须为稳定声明或访问器函数。 */
export function bindPublicProvider(realm: ModuleRealm, provider: PublicProvider, modules: Readonly<Record<string, ModuleExports>>): () => void {
  const declared = provider.modules[realm];
  if (!declared || Object.keys(modules).length !== Object.keys(declared).length)
    throw new Error(`Invalid public modules for ${provider.name} in ${realm}.`);
  for (const [specifier, names] of Object.entries(declared)) {
    const exports = modules[specifier];
    if (!exports || names.length !== Object.keys(exports).length || names.some(name => !Object.hasOwn(exports, name)))
      throw new Error(`Public exports do not match ${specifier} in ${realm}.`);
  }
  const global = globalThis as Record<string, unknown>;
  const registry = (global[registryKey] ??= {}) as Registry;
  const table = registry[realm] ??= {};
  if (table[provider.name]) throw new Error(`Public provider ${provider.name} is already bound in ${realm}.`);
  const binding = { version: provider.version, pluginId: provider.pluginId, modules };
  table[provider.name] = binding;
  return () => { if (table[provider.name] === binding) delete table[provider.name]; };
}

/** 生成 ESM 转接，消费者不执行另一份声明源码；版本也是构建缓存身份的一部分。 */
export function publicModuleSource(provider: PublicProvider, realm: ModuleRealm, specifier: string): string {
  const names = provider.modules[realm]?.[specifier];
  if (!names) throw new Error(`Public module ${specifier} is unavailable in ${realm}.`);
  return [
    `const p = globalThis[${JSON.stringify(registryKey)}]?.[${JSON.stringify(realm)}]?.[${JSON.stringify(provider.name)}];`,
    `if (!p || p.version !== ${JSON.stringify(provider.version)} || p.pluginId !== ${JSON.stringify(provider.pluginId)}) throw new Error(${JSON.stringify(`Public provider ${provider.name}@${provider.version} is unavailable in ${realm}.`)});`,
    `const m = p.modules[${JSON.stringify(specifier)}];`,
    ...names.map((name, index) => `const value${index} = m[${JSON.stringify(name)}]; export { value${index} as ${JSON.stringify(name)} };`),
  ].join("\n");
}
