import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { valid } from "semver";
import { parse, stringify } from "yaml";
import { z } from "zod";
import { applicationStorage } from "../shared/application.ts";
import { saveManagedRecord, restoreManagedRecord } from "./npm-records.ts";
import type { NpmOperation, NpmPreview } from "../shared/contracts.ts";
import { readManifest, type PackageEntry } from "./packages.ts";
import { captureArtifact } from "./artifact-resolver.ts";
import { createNpmProcess, redactNpmOutput, type NpmProcess } from "./npm-process.ts";

const namePattern = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;
const identity = z.object({ name: z.string().regex(namePattern), version: z.string().refine(value => valid(value) !== null) });
const installationFile = "asterism-installation.json";
const installationId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
export type ManagedNpmSource = Extract<PackageEntry["source"], { kind: "npm" }> & { installation: string };

/** Registry-only specs exclude local paths, aliases, tarball URLs, and package-manager options. */
export function registrySpec(value: string): string {
  const spec = value.trim();
  const match = /^((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)(?:@(.+))?$/u.exec(spec);
  if (!match || (match[2] && /[\x00-\x1f\x7f/:\\]/u.test(match[2]))) throw new Error("Enter an npm package name with an optional tag, version, or range.");
  return spec;
}

/** The package manager resolves tags/ranges without scripts; its written exact dependency is the preview. */
export function resolvedPreview(manifestText: string, lockfileText: string, name: string): NpmPreview {
  const manifest = z.object({ dependencies: z.record(z.string(), z.string()) }).parse(JSON.parse(manifestText));
  const version = manifest.dependencies[name];
  if (!version || !valid(version)) throw new Error("The package manager did not resolve an exact published version.");
  const lockfile = z.object({ packages: z.record(z.string(), z.object({ resolution: z.object({ integrity: z.string().optional() }) })) }).parse(parse(lockfileText));
  return { name, version, description: null, integrity: lockfile.packages[`${name}@${version}`]?.resolution.integrity ?? null };
}

/** pnpm's modules manifest records ignored dependency paths, including exact package versions. */
export function blockedBuilds(yaml: string): string[] {
  const modules = z.object({ ignoredBuilds: z.array(z.string()).optional() }).parse(parse(yaml));
  return [...new Set((modules.ignoredBuilds ?? []).map(path => path.replace(/\(.*$/u, "")))].sort();
}

export interface NpmTarget { source: string; name: string; id: string; installation?: string; version?: string }
export interface NpmInstallationOptions {
  npmRoot: string;
  process?: NpmProcess;
  validate?: (root: string) => { id: string };
  /** Publishes a selection only after installation, script review, and artifact admission succeed. */
  publish(source: ManagedNpmSource, target: NpmTarget | null, pluginId: string): void;
}

/** One explicit settings operation at a time; commands start work and return state without blocking dispatch. */
export class NpmInstallations {
  private operation: NpmOperation | null = null;
  private controller: AbortController | null = null;
  private work: Promise<void> | null = null;
  private directory: string | null = null;
  private installation: string | null = null;
  private target: NpmTarget | null = null;
  private approvals: Record<string, boolean> = {};
  private readonly process: NpmProcess;
  private readonly validate: (root: string) => { id: string };
  constructor(private readonly options: NpmInstallationOptions) {
    this.process = options.process ?? createNpmProcess();
    this.validate = options.validate ?? (root => {
      const manifest = readManifest(root);
      captureArtifact(root, manifest.id);
      return manifest;
    });
  }
  snapshot(): NpmOperation | null { return this.operation ? structuredClone(this.operation) : null; }
  preview(spec: string, target: NpmTarget | null = null): void {
    if (this.work || this.operation?.phase === "awaiting-approval") throw new Error("An npm operation is already pending.");
    spec = registrySpec(spec);
    this.target = target;
    this.directory = null; this.installation = null; this.approvals = {};
    this.operation = { id: randomUUID(), spec, targetSource: target?.source ?? null, phase: "inspecting", preview: null, output: "", blockedBuilds: [], error: null };
    this.start(async signal => {
      const name = /^((?:@[^/]+\/)?[^@]+)/u.exec(spec)![1]!;
      if (target && name !== target.name) throw new Error("Updates must retain the selected npm package name.");
      this.installation = randomUUID();
      this.directory = join(this.options.npmRoot, applicationStorage.pluginInstallationsDirectory, this.installation);
      mkdirSync(this.directory, { recursive: true });
      writeFileSync(join(this.directory, installationFile), JSON.stringify({ installation: this.installation, package: null }));
      writeFileSync(join(this.directory, "package.json"), JSON.stringify({ private: true }));
      const result = await this.process.run(["add", spec, "--lockfile-only", "--ignore-scripts", "--save-exact", "--prod", "--reporter=append-only"], this.directory, signal, (_stream, text) => this.output(text));
      signal.throwIfAborted();
      if (result.code !== 0) throw new Error(redactNpmOutput(result.stderr || result.stdout || `pnpm exited with code ${result.code}.`));
      const preview = resolvedPreview(readFileSync(join(this.directory, "package.json"), "utf8"), readFileSync(join(this.directory, "pnpm-lock.yaml"), "utf8"), name);
      this.cleanup();
      this.operation!.preview = preview; this.operation!.phase = "preview";
    });
  }
  install(id: string): void {
    const operation = this.get(id, "preview");
    if (!operation.preview) throw new Error("Inspect a registry package before installing it.");
    operation.phase = "installing";
    this.start(async signal => {
      this.installation = randomUUID();
      this.directory = join(this.options.npmRoot, applicationStorage.pluginInstallationsDirectory, this.installation);
      mkdirSync(this.directory, { recursive: true });
      const preview = operation.preview!;
      writeFileSync(join(this.directory, "package.json"), JSON.stringify({ private: true, dependencies: { [preview.name]: preview.version } }, null, 2));
      // This marker identifies only application-owned projects, never plugin data or external paths.
      writeFileSync(join(this.directory, installationFile), JSON.stringify({ installation: this.installation, package: preview, pluginId: null }, null, 2));
      const restored = Boolean(this.target?.installation && this.target.version === preview.version && restoreManagedRecord(this.options.npmRoot, this.target.installation, this.directory, preview.name, preview.version));
      if (restored) {
        const config = z.object({ allowBuilds: z.record(z.string(), z.boolean()).optional() }).parse(parse(readFileSync(join(this.directory, "pnpm-workspace.yaml"), "utf8")));
        this.approvals = config.allowBuilds ?? {};
      }
      this.writeApprovals();
      await this.acquire(signal, restored);
    });
  }

  approve(id: string, packages: string[]): void {
    const operation = this.get(id, "awaiting-approval");
    if (!packages.length || packages.some(name => !operation.blockedBuilds.includes(name))) throw new Error("Choose packages from the blocked build list.");
    for (const name of packages) this.approvals[name] = true;
    this.writeApprovals(); operation.phase = "installing"; operation.error = null;
    this.start(signal => this.acquire(signal, true));
  }
  cancel(id: string): void {
    if (this.operation?.id !== id) throw new Error("No such npm operation.");
    if (this.work) { this.operation.phase = "cancelling"; this.controller!.abort(); }
    else if (this.operation.phase === "awaiting-approval" || this.operation.phase === "preview") {
      this.cleanup(); this.operation.phase = "cancelled";
    }
  }
  async close(): Promise<void> {
    this.controller?.abort();
    await this.work;
    if (this.operation?.phase === "awaiting-approval") this.cleanup();
  }
  /** Exposed for process contract tests and orderly shutdown, not used to serialize application dispatch. */
  async settled(): Promise<void> { await this.work; }
  private get(id: string, phase: NpmOperation["phase"]): NpmOperation {
    if (this.work || this.operation?.id !== id || this.operation.phase !== phase) throw new Error("The npm operation is not ready for this action.");
    return this.operation;
  }
  private start(run: (signal: AbortSignal) => Promise<void>): void {
    this.controller = new AbortController();
    const signal = this.controller.signal;
    this.work = Promise.resolve().then(() => run(signal)).catch(error => {
      const cancelled = signal.aborted && error === signal.reason;
      this.operation!.phase = cancelled ? "cancelled" : "failed";
      this.operation!.error = cancelled ? null : redactNpmOutput(error instanceof Error ? error.message : String(error));
      try { this.cleanup(); } catch (failure) {
        this.operation!.phase = "failed";
        this.operation!.error = `Installation cleanup failed: ${String(failure)}`;
      }
    }).finally(() => { this.work = null; this.controller = null; });
  }
  private output(text: string): void { this.operation!.output = (this.operation!.output + redactNpmOutput(text)).slice(-32 * 1024); }
  private writeApprovals(): void {
    writeFileSync(join(this.directory!, "pnpm-workspace.yaml"), stringify({
      allowBuilds: this.approvals, strictDepBuilds: true, dangerouslyAllowAllBuilds: false,
    }));
  }
  private async acquire(signal: AbortSignal, frozen: boolean): Promise<void> {
    const result = await this.process.run(["install", "--prod", "--ignore-scripts=false", "--config.strict-dep-builds=true", "--reporter=append-only", ...(frozen ? ["--frozen-lockfile"] : ["--no-frozen-lockfile"])],
      this.directory!, signal, (_stream, text) => this.output(text));
    signal.throwIfAborted();
    const modules = join(this.directory!, "node_modules/.modules.yaml");
    const blocked = existsSync(modules) ? blockedBuilds(readFileSync(modules, "utf8")).filter(name => !this.approvals[name]) : [];
    if (result.code !== 0) {
      if (blocked.length && /ERR_PNPM_IGNORED_BUILDS/u.test(result.stdout + result.stderr)) {
        this.operation!.blockedBuilds = blocked; this.operation!.phase = "awaiting-approval";
        return;
      }
      throw new Error(redactNpmOutput(result.stderr || result.stdout || `pnpm exited with code ${result.code}.`));
    }
    if (blocked.length) throw new Error(`Dependency builds remain unreviewed: ${blocked.join(", ")}`);
    const preview = this.operation!.preview!;
    const acquired = resolvedPreview(readFileSync(join(this.directory!, "package.json"), "utf8"),
      readFileSync(join(this.directory!, "pnpm-lock.yaml"), "utf8"), preview.name);
    if (preview.integrity && acquired.integrity !== preview.integrity)
      throw new Error("The acquired package integrity differs from the inspected version. Inspect the package again.");
    const root = join(this.directory!, "node_modules", preview.name);
    const installed = identity.parse(JSON.parse(readFileSync(join(root, "package.json"), "utf8")));
    if (installed.name !== preview.name || installed.version !== preview.version) throw new Error("The installed package identity does not match the confirmed version.");
    // Manifest and artifact validation reads descriptors/files without importing executable entries.
    const manifest = this.validate(root);
    if (this.target && manifest.id !== this.target.id) throw new Error("The updated artifact must retain the selected plugin ID.");
    writeFileSync(join(this.directory!, installationFile), JSON.stringify({ installation: this.installation, package: { ...preview, integrity: acquired.integrity }, pluginId: manifest.id }, null, 2));
    signal.throwIfAborted();
    saveManagedRecord(this.options.npmRoot, this.installation!, this.directory!);
    this.options.publish({ kind: "npm", name: preview.name, version: preview.version, installation: this.installation! }, this.target, manifest.id);
    this.directory = null; this.installation = null;
    this.operation!.blockedBuilds = []; this.operation!.phase = "succeeded";
  }
  private cleanup(): void {
    if (this.directory) rmSync(this.directory, { recursive: true, force: true });
    this.directory = null; this.installation = null;
  }
}

/** Call at a fresh startup, before plugin imports. Running installations are never reclaimed mid-session. */
export function collectManagedInstallations(npmRoot: string, retained: ReadonlySet<string>): void {
  const root = join(npmRoot, applicationStorage.pluginInstallationsDirectory);
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !installationId.test(entry.name) || retained.has(entry.name)) continue;
    const directory = join(root, entry.name);
    if (existsSync(join(directory, installationFile))) rmSync(directory, { recursive: true, force: true });
  }
}
