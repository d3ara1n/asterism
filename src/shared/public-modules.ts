/** Host facades preserve stable exported values, not namespace identity or reassigned bindings. */
export function hostModuleSource(global: string, specifier: string, names: readonly string[]): string {
  return [`const m = globalThis[${JSON.stringify(global)}][${JSON.stringify(specifier)}];`,
    ...names.map((name, index) => `const v${index} = m[${JSON.stringify(name)}]; export { v${index} as ${JSON.stringify(name)} };`)].join("\n");
}
