import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import type { CompiledModules } from "./package-modules.ts";

const entries = z.array(z.tuple([z.string(), z.string()]));
const dependencies = z.array(z.tuple([z.string(), z.array(z.string())]));
const cacheSchema = z.object({
  key: z.string(), files: z.array(z.string()),
  runtime: entries, renderer: entries, dependencies, runtimeDependencies: dependencies, rendererDependencies: dependencies,
});
function inside(root: string, path: string): boolean {
  const part = relative(root, path);
  return part !== ".." && !part.startsWith(`..${sep}`) && !isAbsolute(part);
}

/**
 * 完整源码树与候选 node_modules 的内容指纹覆盖新增解析候选。
 * 范围外 helper、配置继承与路径映射仍正常构建，本批次不复用缓存。
 */
export class PluginBuildCache {
  private readonly roots: string[];
  private readonly ancestors = new Set<string>();
  private readonly checkedConfigurations = new Set<string>();
  private reusable = true;
  private readonly index: string;
  readonly key: string | null;
  constructor(private readonly directory: string, sourceRoots: readonly string[], recipe: unknown) {
    directory = this.directory = resolve(directory);
    this.index = join(directory, "build-index.json");
    const roots = new Set(sourceRoots.map(root => realpathSync(root)));
    for (const root of sourceRoots) {
      let parent = resolve(root);
      while (true) {
        this.ancestors.add(parent);
        roots.add(join(parent, "node_modules"));
        const next = dirname(parent);
        if (next === parent) break;
        parent = next;
      }
    }
    this.roots = [...roots].sort().filter(root => ![...roots].some(other => other !== root && inside(other, root)));
    const hash = createHash("sha256").update(JSON.stringify(recipe));
    const record = (path: string, kind: string, value: string | Buffer = "") => {
      hash.update(JSON.stringify([path, kind, value.length])).update(value);
    };
    const scan = (path: string) => {
      if (inside(directory, path) || basename(path) === ".git") return;
      const stat = lstatSync(path, { throwIfNoEntry: false });
      if (!stat) { record(path, "missing"); return; }
      if (stat.isSymbolicLink()) {
        record(path, "link", readlinkSync(path));
        if (!this.covers(realpathSync(path))) this.reusable = false;
      } else if (stat.isDirectory()) {
        record(path, "directory");
        for (const name of readdirSync(path).sort()) scan(join(path, name));
      } else if (stat.isFile()) {
        const contents = readFileSync(path);
        record(path, "file", contents);
      } else this.reusable = false;
    };
    try {
      for (const root of this.roots) scan(root);
      for (const ancestor of [...this.ancestors].sort()) for (const name of ["package.json", "tsconfig.json"]) {
        const path = join(ancestor, name);
        if (!this.covers(path)) scan(path);
      }
      this.key = this.reusable ? hash.digest("hex") : null;
    } catch (error) {
      this.key = null;
      console.warn("Plugin build cache inputs could not be inspected.", error);
    }
  }

  private covers(path: string): boolean {
    return !inside(this.directory, path) && !path.split(sep).includes(".git") && this.roots.some(root => inside(root, path));
  }
  /** 检查原始候选的父目录，覆盖 ../pkg 同时可能解析到 pkg.js 或 pkg/index.js 的情况。 */
  resolution(path: string, importer: string, resolveDir: string): void {
    if (!this.reusable || !importer || !resolveDir) return;
    if (path.startsWith("#")) { this.reusable = false; return; }
    if (path.startsWith(".") || isAbsolute(path)) {
      const candidate = resolve(resolveDir, path);
      if (!this.covers(dirname(candidate))) this.reusable = false;
    }
  }
  inputs(paths: readonly string[]): void {
    for (const path of paths) {
      if (path.startsWith("atelier-host:") || path.startsWith("atelier-public:")) continue;
      const file = resolve(path);
      if (!this.covers(file)) { this.reusable = false; continue; }
      let parent = dirname(file);
      while (!this.checkedConfigurations.has(parent)) {
        this.checkedConfigurations.add(parent);
        const config = join(parent, "tsconfig.json");
        if (existsSync(config)) {
          try {
            const value = JSON.parse(readFileSync(config, "utf8"));
            if (value.extends || value.compilerOptions?.baseUrl || value.compilerOptions?.paths) this.reusable = false;
          } catch { this.reusable = false; }
          break;
        }
        const next = dirname(parent);
        if (next === parent) break;
        parent = next;
      }
    }
  }

  read(): CompiledModules | null {
    if (!this.key) return null;
    try {
      const cached = cacheSchema.parse(JSON.parse(readFileSync(this.index, "utf8")));
      if (cached.key !== this.key || !cached.files.every(path => existsSync(path))) return null;
      return { runtime: new Map(cached.runtime), renderer: new Map(cached.renderer),
        dependencies: new Map(cached.dependencies.map(([id, values]) => [id, new Set(values)])),
        runtimeDependencies: new Map(cached.runtimeDependencies.map(([id, values]) => [id, new Set(values)])),
        rendererDependencies: new Map(cached.rendererDependencies.map(([id, values]) => [id, new Set(values)])),
        failures: new Map() };
    } catch { return null; }
  }
  write(result: CompiledModules, files: readonly string[]): void {
    if (!this.key || !this.reusable || result.failures.size) return;
    const serialize = (map: Map<string, Set<string>>) => [...map].map(([id, values]) => [id, [...values]]);
    try {
      mkdirSync(this.directory, { recursive: true });
      const temporary = `${this.index}.tmp`;
      writeFileSync(temporary, JSON.stringify({ key: this.key, files,
        runtime: [...result.runtime], renderer: [...result.renderer], dependencies: serialize(result.dependencies),
        runtimeDependencies: serialize(result.runtimeDependencies), rendererDependencies: serialize(result.rendererDependencies) }));
      renameSync(temporary, this.index);
    } catch (error) { console.warn("Plugin build cache index could not be saved.", error); }
  }
}
