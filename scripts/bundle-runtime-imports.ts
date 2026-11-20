import { isBuiltin } from "node:module";
import type { Plugin } from "vite";

export const runtimeImportsFile = "asterism-runtime-imports.json";

/** Desktop Node bundles own their external dependency roots; browser bundles do not contribute roots. */
export function bundleRuntimeImports(extraImports: ReadonlySet<string>): Plugin {
  return {
    name: "asterism-runtime-imports",
    generateBundle: { order: "post", handler(_, bundle) {
      const imports = new Set(extraImports);
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        for (const specifier of [...output.imports, ...output.dynamicImports]) {
          if (!Object.hasOwn(bundle, specifier) && !isBuiltin(specifier) && !/^electron(?:\/|$)/u.test(specifier)) imports.add(specifier);
        }
      }
      this.emitFile({ type: "asset", fileName: runtimeImportsFile, source: JSON.stringify([...imports].sort()) });
    } },
  };
}
