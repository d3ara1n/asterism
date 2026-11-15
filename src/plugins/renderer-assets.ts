import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { createRequire } from "node:module";
import type { Plugin } from "esbuild";

/** URL imports keep a library's resource filenames intact, including directory-relative fetches from workers. */
export function rendererAssets(): Plugin {
  return { name: "asterism-renderer-assets", setup(build) {
    build.onResolve({ filter: /\?url$/ }, async args => {
      const source = args.path.slice(0, -4);
      // Package directory imports end in / and resolve relative to the package's exported metadata.
      const directory = /^(?<name>@[^/]+\/[^/]+|[^./][^/]*)(?<subpath>\/.*)\/$/u.exec(source);
      let path: string;
      if (directory) {
        const require = createRequire(join(args.resolveDir, "package.json"));
        const root = dirname(require.resolve(`${directory.groups!.name}/package.json`));
        path = resolve(root, directory.groups!.subpath!.slice(1));
      } else if (isAbsolute(source) || source.startsWith(".")) {
        path = resolve(args.resolveDir, source);
      } else {
        const resolved = await build.resolve(source, { kind: args.kind, resolveDir: args.resolveDir });
        if (resolved.errors.length) return resolved;
        path = resolved.path;
      }
      return { path, namespace: "asterism-asset-url" };
    });
    build.onResolve({ filter: /.*/, namespace: "asterism-asset-url" }, args => ({
      path: args.path, namespace: "file", suffix: "?url", pluginData: { asset: true },
    }));
    build.onLoad({ filter: /.*/, namespace: "file" }, args => args.pluginData?.asset
      ? { contents: readFileSync(args.path), loader: "file" } : undefined);
    build.onLoad({ filter: /.*/, namespace: "asterism-asset-url" }, args => {
      const directory = statSync(args.path).isDirectory();
      const files = directory ? descendants(args.path) : [args.path];
      if (!files.length) throw new Error(`Asset directory is empty: ${args.path}`);
      const imports = files.map((file, index) => `import asset${index} from ${JSON.stringify(file)};`).join("\n");
      // Referencing every file includes the entire directory even when only its base URL is consumed.
      const urls = `const assets = [${files.map((_, index) => `asset${index}`).join(",")}];`;
      const base = directory ? `${relative(dirname(files[0]!), args.path).split("\\").join("/") || "."}/` : "";
      const url = "new URL(assets[0], import.meta.url)";
      return { contents: `${imports}\n${urls}\nexport default ${directory ? `new URL(${JSON.stringify(base)}, ${url})` : url}.href;`, loader: "js" };
    });
  } };
}

function descendants(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? descendants(path) : [path];
  });
}
