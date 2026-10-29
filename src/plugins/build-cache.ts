import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import type { CompiledModules } from "./package-modules.ts";

const entries = z.array(z.tuple([z.string(), z.string()]));
const dependencies = z.array(z.tuple([z.string(), z.array(z.string())]));
const cacheSchema = z.object({
  key: z.string(), files: z.array(z.string()), observed: entries,
  runtime: entries, storage: entries, renderer: entries, stylesheets: entries, dependencies, runtimeDependencies: dependencies, rendererDependencies: dependencies,
});
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

/** What resolution and bundling observe at a path: file contents, directory entry names, or absence. */
function fingerprint(path: string): string {
  const stat = statSync(path, { throwIfNoEntry: false });
  if (!stat) return "missing";
  return stat.isDirectory() ? `directory:${digest(readdirSync(path).sort().join("\0"))}` : `file:${digest(readFileSync(path))}`;
}

/**
 * The index is valid while every path the last build observed still looks the same.
 * Inputs record their contents and directory listings; each ancestor records package.json, tsconfig.json and node_modules,
 * so new higher-priority candidates, nearer dependencies, package exports and new configuration invalidate it.
 * Inherited TypeScript configuration of plugin sources reads files outside this set, so such builds are not cached.
 */
export class PluginBuildCache {
  private readonly observed = new Set<string>();
  private readonly ancestors = new Set<string>();
  private readonly configurations = new Set<string>();
  private reusable = true;
  private readonly index: string;
  readonly key: string;
  constructor(directory: string, recipe: unknown) {
    this.index = join(resolve(directory), "build-index.json");
    this.key = digest(JSON.stringify(recipe));
  }

  /** Paths reported by the esbuild metafile; host and public module namespaces are not files. */
  inputs(paths: readonly string[]): void {
    for (const path of paths) {
      if (/^[a-z][a-z-]+:/u.test(path)) continue;
      const file = resolve(path);
      this.observed.add(file).add(dirname(file));
      // esbuild reads tsconfig.json only for files outside node_modules.
      if (!file.split(/[\\/]/u).includes("node_modules")) this.configuration(dirname(file));
      for (let parent = dirname(file); !this.ancestors.has(parent); parent = dirname(parent)) {
        this.ancestors.add(parent);
        for (const name of ["package.json", "tsconfig.json", "node_modules"]) this.observed.add(join(parent, name));
        if (dirname(parent) === parent) break;
      }
    }
  }
  private configuration(start: string) {
    for (let parent = start; !this.configurations.has(parent); parent = dirname(parent)) {
      this.configurations.add(parent);
      const file = join(parent, "tsconfig.json");
      if (existsSync(file)) {
        try {
          const value = JSON.parse(readFileSync(file, "utf8"));
          if (value.extends || value.compilerOptions?.baseUrl || value.compilerOptions?.paths) this.reusable = false;
        } catch { this.reusable = false; }
        return;
      }
      if (dirname(parent) === parent) return;
    }
  }

  read(): CompiledModules | null {
    try {
      const cached = cacheSchema.parse(JSON.parse(readFileSync(this.index, "utf8")));
      if (cached.key !== this.key || !cached.files.every(path => existsSync(path))
        || !cached.observed.every(([path, value]) => fingerprint(path) === value)) return null;
      return { runtime: new Map(cached.runtime), storage: new Map(cached.storage), renderer: new Map(cached.renderer), stylesheets: new Map(cached.stylesheets),
        dependencies: new Map(cached.dependencies.map(([id, values]) => [id, new Set(values)])),
        runtimeDependencies: new Map(cached.runtimeDependencies.map(([id, values]) => [id, new Set(values)])),
        rendererDependencies: new Map(cached.rendererDependencies.map(([id, values]) => [id, new Set(values)])),
        failures: new Map() };
    } catch { return null; }
  }
  write(result: CompiledModules, files: readonly string[]): void {
    if (!this.reusable || result.failures.size) return;
    const serialize = (map: Map<string, Set<string>>) => [...map].map(([id, values]) => [id, [...values]]);
    try {
      mkdirSync(dirname(this.index), { recursive: true });
      // Fingerprint after creating the cache directory so its own appearance does not invalidate the index.
      const observed = [...this.observed].sort().map(path => [path, fingerprint(path)]);
      const temporary = `${this.index}.tmp`;
      writeFileSync(temporary, JSON.stringify({ key: this.key, files, observed,
        runtime: [...result.runtime], storage: [...result.storage], renderer: [...result.renderer], stylesheets: [...result.stylesheets], dependencies: serialize(result.dependencies),
        runtimeDependencies: serialize(result.runtimeDependencies), rendererDependencies: serialize(result.rendererDependencies) }));
      renameSync(temporary, this.index);
    } catch (error) { console.warn("Plugin build cache index could not be saved.", error); }
  }
}
