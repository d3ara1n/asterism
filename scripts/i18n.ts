import { localeSchema } from "@asterism/sdk/contracts";
import { parse } from "@formatjs/icu-messageformat-parser";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, realpathSync } from "node:fs";
import { resolve, join, relative, isAbsolute, sep } from "node:path";

import { compatibleMessage } from "../src/shared/i18n.ts";

interface Source {
  defaultMessage: string;
  description?: string;
}

interface Group {
  owner: string;
  root: string;
  files: string[];
  catalogs: Record<string, string>;
  complete: boolean;
}

const project = resolve(import.meta.dirname, "..");

function files(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    if (["node_modules", ".git", "dist", "out", ".i18n"].includes(entry.name) || entry.isSymbolicLink()) return [];
    const path = join(root, entry.name);
    return entry.isDirectory() ? files(path) : /\.[cm]?[jt]sx?$/u.test(entry.name) && !/\.test\./u.test(entry.name) ? [path] : [];
  });
}

function groups(packageRoot?: string): Group[] {
  if (packageRoot) {
    const root = resolve(packageRoot);
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    if (typeof pkg.asterism?.id !== "string") throw new Error("The package requires an Asterism identity.");
    return [{
      owner: pkg.asterism.id,
      root,
      files: files(root),
      catalogs: pkg.asterism.i18n?.catalogs ?? {},
      complete: false
    }];
  }
  return [{
    owner: "asterism.host",
    root: project,
    files: [...files(join(project, "src/renderer")), ...files(join(project, "src/shared")), ...files(join(project, "packages/ui/src"))],
    catalogs: {
      "zh-Hans": "src/shared/locales/zh-Hans.json"
    },
    complete: true
  }, {
    owner: "asterism.builtin",
    root: project,
    files: files(join(project, "packages/builtin/src")),
    catalogs: {
      "zh-Hans": "packages/builtin/src/locales/zh-Hans.json"
    },
    complete: true
  }];
}

/** 使用真实官方 CLI；SDK wrapper 保留可抽取的标准字面量。 */
export function extractMessages(paths: readonly string[], scratch: string): Record<string, Source> {
  const inputs = join(scratch, "inputs.txt");
  const output = join(scratch, "messages.json");
  writeFileSync(inputs, paths.join("\n"));
  execFileSync(process.execPath, [
    join(project, "node_modules/@formatjs/cli/bin/formatjs"), "extract", "--in-file", inputs,
    "--out-file", output, "--throws", "--id-interpolation-pattern", "__missing_explicit_id__[sha512:contenthash:base64:6]",
  ], { cwd: project, stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(readFileSync(output, "utf8"));
}

function inside(root: string, file: string) {
  const path = relative(root, file);
  return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

export function checkCatalog(group: Group, sources: Record<string, Source>): void {
  const locales = new Set<string>();
  for (const [tag, path] of Object.entries(group.catalogs)) {
    const locale = localeSchema.parse(tag);
    if (locales.has(locale)) throw new Error(`Duplicate catalog locale: ${group.owner}/${tag}.`);
    locales.add(locale);
    const file = resolve(group.root, path);
    if (!inside(group.root, file) || !inside(realpathSync(group.root), realpathSync(file))) throw new Error(`Catalog is outside package: ${path}.`);
    const messages: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!messages || typeof messages !== "object" || Array.isArray(messages)) throw new Error(`Invalid catalog: ${path}.`);
    let translated = 0;
    for (const [id, value] of Object.entries(messages)) {
      if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid translation: ${group.owner}/${id}.`);
      parse(value);
      if (!sources[id]) throw new Error(`Unknown translation ID: ${group.owner}/${id}.`);
      if (!compatibleMessage(sources[id].defaultMessage, value)) throw new Error(`Incompatible translation parameters: ${group.owner}/${id}.`);
      translated++;
    }
    console.info(`${group.owner} ${locale}: ${translated}/${Object.keys(sources).length} messages translated.`);
    if (group.complete && translated !== Object.keys(sources).length) throw new Error(`Incomplete builtin catalog: ${group.owner}/${locale}.`);
  }
}

export function run(mode: string, packageRoot?: string): void {
  if (!["check", "extract"].includes(mode)) throw new Error("Use check or extract, optionally followed by a plugin package root.");
  const scratch = mkdtempSync(join(project, ".i18n-check-"));
  try {
    for (const group of groups(packageRoot)) {
      // 分文件抽取并比较，避免聚合输出覆盖重复 ID 后掩盖不一致默认文案。
      const source: Record<string, Source> = {};
      for (const file of group.files.filter(path => /\bdefineMessages\s*\(/u.test(readFileSync(path, "utf8")))) {
        const declarations = extractMessages([file], scratch);
        for (const [id, message] of Object.entries(declarations)) {
          if (id.startsWith("__missing_explicit_id__") || !message.defaultMessage?.trim()) throw new Error(`A stable ID and default message are required: ${file}.`);
          parse(message.defaultMessage);
          if (source[id] && JSON.stringify(source[id]) !== JSON.stringify(message)) throw new Error(`Conflicting declaration: ${group.owner}/${id}.`);
          source[id] = message;
        }
      }
      if (mode === "extract") {
        const output = join(group.root, ".i18n", `${group.owner}.json`);
        mkdirSync(join(group.root, ".i18n"), { recursive: true });
        writeFileSync(output, `${JSON.stringify(source, null, 2)}\n`);
        console.info(`Extracted ${Object.keys(source).length} messages to ${relative(project, output)}.`);
      } else {
        checkCatalog(group, source);
        console.info(`Checked ${Object.keys(source).length} ${group.owner} source messages.`);
      }
    }
    // 每次项目检查都使用实际 SDK 作者写法验证抽取，而不是模拟返回值。
    if (!packageRoot) {
      const author = extractMessages([join(project, "packages/sdk/examples/i18n.ts")], scratch);
      if (author["counter.items"]?.defaultMessage !== "{count, plural, one {# item} other {# items}}") throw new Error("SDK author declarations could not be extracted.");
      console.info("SDK author declarations extracted with the FormatJS CLI.");
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (resolve(process.argv[1] ?? "") === resolve(import.meta.filename)) run(process.argv[2] ?? "check", process.argv[3]);
