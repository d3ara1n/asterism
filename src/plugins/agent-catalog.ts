import { isUtf8 } from "node:buffer";
import { pathWithin } from "../storage/paths.ts";
import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { parseDocument } from "yaml";
import { PluginApiError, type AgentCatalog, type AgentInstruction, type AgentInstructionDeclaration, type AgentSkill, type AgentSkillDeclaration, type AgentSkillSource, type AgentSource } from "@asterism-app/sdk/runtime";

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const within = (root: string, path: string) => pathWithin(root, path) !== null;
const failure = (reason: string, message: string): never => { throw new PluginApiError("rejected", message, reason); };

function skillFile(directory: string, path: string): string {
  if (isAbsolute(path) || path.includes("\0")) return failure("invalid_skill_path", "path is a relative file path within the selected skill package.");
  const candidate = resolve(directory, path);
  if (!within(directory, candidate)) return failure("outside_skill", "path resolves outside the selected skill package. Relative paths are based on its directory.");
  const actual = realpathSync(candidate);
  if (!within(directory, actual)) return failure("outside_skill", "The file's symbolic link resolves outside the selected skill package.");
  const info = statSync(actual);
  if (!info.isFile()) return failure("not_file", "The target requires a regular UTF-8 text file.");
  if (info.size > MAX_TEXT_BYTES) return failure("file_too_large", "The target exceeds the 8 MiB text file limit.");
  return actual;
}
const MAX_TEXT_BYTES = 8 * 1024 * 1024;
/** The same text format as Builtin's filesystem reads: valid UTF-8 without control bytes or a PDF header; a BOM is preserved. */
function decode(bytes: Buffer): string {
  if (bytes.length > MAX_TEXT_BYTES) return failure("file_too_large", "The target exceeds the 8 MiB text file limit.");
  if (!isUtf8(bytes) || bytes.subarray(0, 5).toString("ascii") === "%PDF-" || bytes.some(byte => byte < 9 || (byte > 13 && byte < 32)))
    return failure("unsupported_text", "The content format differs from the supported UTF-8 text format.");
  return bytes.toString("utf8");
}
export function parseSkillMetadata(text: string): Pick<AgentSkill, "name" | "description"> {
  const frontmatter = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)^---[ \t]*\r?$/m.exec(text);
  if (!frontmatter || frontmatter.index !== 0) return failure("invalid_skill", "SKILL.md requires YAML frontmatter enclosed by --- lines.");
  const document = parseDocument(frontmatter[1]);
  if (document.errors.length) return failure("invalid_skill", document.errors.map(error => error.message).join("\n"));
  const parsed = document.toJS();
  if (!parsed || typeof parsed.name !== "string" || !parsed.name.trim() || typeof parsed.description !== "string" || !parsed.description.trim())
    return failure("invalid_skill", "Skill frontmatter requires non-empty string fields: name and description.");
  return { name: parsed.name.trim(), description: parsed.description.trim() };
}
function scan(source: AgentSource, signal: AbortSignal): AgentSkillSource {
  signal.throwIfAborted();
  const result: AgentSkillSource = { ...source, skills: [], issues: [] };
  let entries;
  try { entries = readdirSync(source.directory, { withFileTypes: true }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") result.issues.push({ file: source.directory, message: String(error) });
    return result;
  }
  for (const entry of entries.sort((a, b) => compare(a.name, b.name))) {
    signal.throwIfAborted();
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const location = join(source.directory, entry.name);
    try {
      const directory = realpathSync(location);
      if (!statSync(directory).isDirectory() || !readdirSync(directory).includes("SKILL.md")) continue;
      const metadata = parseSkillMetadata(decode(readFileSync(skillFile(directory, "SKILL.md"))));
      result.skills.push({ ...metadata, directory, source: { ...source } });
    } catch (error) {
      result.issues.push({ file: join(location, "SKILL.md"), message: error instanceof Error ? error.message : String(error) });
    }
  }
  const counts = new Map<string, number>();
  for (const skill of result.skills) counts.set(skill.name, (counts.get(skill.name) ?? 0) + 1);
  result.skills = result.skills.filter(skill => {
    if (counts.get(skill.name) === 1) return true;
    result.issues.push({ file: join(skill.directory, "SKILL.md"), message: `Duplicate skill name: ${skill.name}. Each skill name identifies one package within a source.` });
    return false;
  }).sort((a, b) => compare(a.name, b.name));
  return result;
}

/** Skill directory of the current OS user. */
export const userSkillDirectory = () => join(homedir(), ".agents", "skills");

/** Host collection preserves all sources; priority and prompt projection belong to consumers. */
export class AgentCatalogService implements AgentCatalog {
  private sources = new Map<string, AgentSource>();
  private blocks = new Map<string, AgentInstruction>();
  private snapshots: AgentSkillSource[] = [];
  private listeners = new Set<() => void>();
  constructor(userDirectories: readonly string[]) {
    for (const directory of userDirectories) this.sources.set(directory, { id: directory, plugin: null, directory });
  }
  register(plugin: string, assets: { path(value: string): string }, skills: readonly AgentSkillDeclaration[], instructions: readonly AgentInstructionDeclaration[]) {
    for (const declaration of skills) {
      const id = `${plugin}:${declaration.id}`;
      if (!declaration.id.trim() || this.sources.has(id)) throw new PluginApiError("conflict", `Duplicate or empty skill source: ${id}`);
      this.sources.set(id, { id, plugin, directory: assets.path(declaration.path) });
    }
    for (const declaration of instructions) {
      const id = `${plugin}:${declaration.id}`;
      if (!declaration.id.trim() || this.blocks.has(id)) throw new PluginApiError("conflict", `Duplicate or empty instruction: ${id}`);
      this.blocks.set(id, { id, plugin, text: declaration.text });
    }
  }
  remove(plugin: string) {
    for (const [id, source] of this.sources) if (source.plugin === plugin) this.sources.delete(id);
    for (const [id, block] of this.blocks) if (block.plugin === plugin) this.blocks.delete(id);
    this.snapshots = this.snapshots.filter(source => source.plugin !== plugin);
  }
  skills(): AgentSkillSource[] { return this.snapshots; }
  instructions(): AgentInstruction[] { return [...this.blocks.values()]; }
  refresh(signal: AbortSignal): AgentSkillSource[] {
    const snapshots = [...this.sources.values()].map(source => scan(source, signal));
    signal.throwIfAborted();
    this.snapshots = snapshots;
    for (const listener of this.listeners) listener();
    return this.snapshots;
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  async read(skill: AgentSkill, path: string, signal: AbortSignal): Promise<string> {
    signal.throwIfAborted();
    return decode(await readFile(skillFile(skill.directory, path), { signal }));
  }
}
