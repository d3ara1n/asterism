import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { Plugin } from "vite";

const virtual = "\0asterism-url:";
const portable = (value: string) => value.replaceAll("\\", "/");
async function descendants(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory()
    ? descendants(join(path, entry.name)) : [join(path, entry.name)]))).flat();
}

/** Explicit URL imports preserve directory topology for workers that fetch sibling resources. */
export function rendererAssets(root: string): Plugin {
  const sources = new Map<string, string>();
  return {
    name: "asterism-directory-assets", enforce: "pre",
    async resolveId(id, importer) {
      if (!id.endsWith("?url")) return;
      const source = id.slice(0, -4);
      const from = importer ? dirname(importer.split("?")[0]!) : root;
      const directory = /^(?<name>@[^/]+\/[^/]+|[^./][^/]*)(?<subpath>\/.*)\/$/u.exec(source);
      let path: string;
      if (directory) {
        const require = createRequire(join(from, "package.json"));
        path = resolve(dirname(require.resolve(`${directory.groups!.name}/package.json`)), directory.groups!.subpath!.slice(1));
      } else if (isAbsolute(source) || source.startsWith(".")) path = resolve(from, source);
      else {
        const resolved = await this.resolve(source, importer, { skipSelf: true });
        if (!resolved || resolved.external) throw new Error(`Cannot resolve URL asset ${id}`);
        path = resolved.id;
      }
      // Bundler module labels can appear in emitted comments; keep machine paths out of IDs.
      const virtualId = `${virtual}${createHash("sha256").update(portable(relative(root, path))).digest("hex").slice(0, 16)}`;
      sources.set(virtualId, path);
      return virtualId;
    },
    async load(id) {
      if (!id.startsWith(virtual)) return;
      const path = sources.get(id)!;
      const directory = (await stat(path)).isDirectory();
      const files = directory ? await descendants(path) : [path];
      if (!files.length) throw new Error(`Asset directory is empty: ${path}`);
      const namespace = createHash("sha256").update(portable(relative(root, path))).digest("hex").slice(0, 16);
      const references: string[] = [];
      for (const file of files) {
        this.addWatchFile(file);
        references.push(this.emitFile({ type: "asset", fileName: `assets/url-${namespace}/${directory ? portable(relative(path, file)) : basename(file)}`, source: await readFile(file) }));
      }
      const url = `import.meta.ROLLUP_FILE_URL_${references[0]}`;
      const base = `${portable(relative(dirname(files[0]!), path)) || "."}/`;
      return `export default ${directory ? `new URL(${JSON.stringify(base)}, ${url}).href` : url};`;
    },
    resolveFileUrl({ relativePath }) { return `new URL(${JSON.stringify(relativePath)}, import.meta.url).href`; },
  };
}
