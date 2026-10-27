import { readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { parseDocument } from "yaml";
import { builtin } from "@asterism-app/builtin-api/contracts";
import type { PromptBlock } from "@asterism-app/sdk/contracts";
import { insideDirectory } from "../filesystem/paths.ts";
import { readTextFile, readTextFileSync } from "../filesystem/text-io.ts";
import { readText } from "../shared/text.ts";
import { skillMetadataSchema, type SkillIssue, type SkillMetadata, type SkillOverview, type SkillReadArgs } from "./contract.ts";

export class SkillError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

/**
 * Skill source: a directory containing skill-package subdirectories.
 * id is used only for settings grouping and auditing: an absolute path for directory sources, a plugin ID for plugin sources, and builtin for software-bundled sources.
 */
export interface SkillSource { id: string; directory: string }
interface SkillEntry extends SkillMetadata { directory: string; file: string }
interface SourceSnapshot { source: string; skills: SkillEntry[]; issues: SkillIssue[] }

/** Skill directory for the current system user. */
export const userSkillSource = (): SkillSource => {
  const directory = join(homedir(), ".agents", "skills");
  return { id: directory, directory };
};

/** The parser handles frontmatter YAML semantics; the catalog consumes only names and descriptions, leaving other fields in the original file. */
export function parseSkillMetadata(text: string): SkillMetadata {
  const frontmatter = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)^---[ \t]*\r?$/m.exec(text);
  if (!frontmatter || frontmatter.index !== 0)
    throw new SkillError("invalid_skill", "SKILL.md requires YAML frontmatter enclosed by --- lines.");
  const document = parseDocument(frontmatter[1]);
  if (document.errors.length) throw new SkillError("invalid_skill", document.errors.map(error => error.message).join("\n"));
  const parsed = skillMetadataSchema.safeParse(document.toJS());
  if (!parsed.success) throw new SkillError("invalid_skill", "Skill frontmatter requires non-empty string fields: name and description.");
  return parsed.data;
}

/** Package roots may be installed through symlinks; both lexical and real paths of internal targets stay within the selected package root. */
function skillFile(directory: string, path: string): string {
  if (isAbsolute(path) || path.includes("\0"))
    throw new SkillError("invalid_skill_path", "path is a relative file path within the selected skill package.");
  const candidate = resolve(directory, path);
  if (!insideDirectory(directory, candidate))
    throw new SkillError("outside_skill", "path resolves outside the selected skill package. Relative paths are based on its directory.");
  const file = realpathSync(candidate);
  if (!insideDirectory(directory, file))
    throw new SkillError("outside_skill", "The file's symbolic link resolves outside the selected skill package.");
  return file;
}

const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Scans one source; all same-name entries within it are reported as ambiguous, with no selection based on scan order. */
function scanSource(source: SkillSource, signal: AbortSignal): SourceSnapshot {
  signal.throwIfAborted();
  const result: SourceSnapshot = { source: source.id, skills: [], issues: [] };
  let entries;
  try { entries = readdirSync(source.directory, { withFileTypes: true }); }
  catch (error) {
    signal.throwIfAborted();
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      result.issues.push({ file: source.directory, message: messageOf(error) });
    return result;
  }
  for (const entry of entries.sort((a, b) => compare(a.name, b.name))) {
    signal.throwIfAborted();
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const location = join(source.directory, entry.name);
    try {
      const directory = realpathSync(location);
      if (!statSync(directory).isDirectory()) continue;
      // Ordinary grouping directories lack SKILL.md and are not reported as invalid skills; broken links and body-read failures remain visible.
      if (!readdirSync(directory).includes("SKILL.md")) continue;
      const file = skillFile(directory, "SKILL.md");
      const { text } = readTextFileSync(file);
      result.skills.push({ ...parseSkillMetadata(text), directory, file });
    } catch (error) {
      signal.throwIfAborted();
      result.issues.push({ file: join(location, "SKILL.md"), message: messageOf(error) });
    }
  }
  const counts = new Map<string, number>();
  for (const skill of result.skills) counts.set(skill.name, (counts.get(skill.name) ?? 0) + 1);
  result.skills = result.skills.filter(skill => {
    if (counts.get(skill.name) === 1) return true;
    result.issues.push({ file: skill.file, message: `Duplicate skill name: ${skill.name}. Each skill name identifies one package within a source.` });
    return false;
  }).sort((a, b) => compare(a.name, b.name));
  return result;
}

/**
 * Shared runtime catalog: rebuilt at startup and on explicit refresh; ordinary queries read memory only, and bodies are read at call time.
 * Sources are ordered from lower to higher priority, with later sources overriding same-name skills from earlier ones; the model sees only effective skill names and descriptions.
 */
export class SkillCatalog {
  private snapshots: SourceSnapshot[];
  private active = new Map<string, { entry: SkillEntry; source: string }>();
  private instructions: PromptBlock;
  constructor(readonly sources: readonly SkillSource[] = [userSkillSource()]) {
    this.snapshots = sources.map(source => ({ source: source.id, skills: [], issues: [] }));
    this.instructions = skillCatalogPrompt([]);
  }

  refresh(signal: AbortSignal): SkillOverview {
    const snapshots = this.sources.map(source => scanSource(source, signal));
    signal.throwIfAborted();
    const active = new Map<string, { entry: SkillEntry; source: string }>();
    for (const snapshot of snapshots)
      for (const entry of snapshot.skills) active.set(entry.name, { entry, source: snapshot.source });
    this.snapshots = snapshots;
    this.active = active;
    this.instructions = skillCatalogPrompt([...active.values()].map(({ entry }) => entry).sort((a, b) => compare(a.name, b.name)));
    return this.overview();
  }

  overview(): SkillOverview {
    return { sources: this.snapshots.map(snapshot => ({
      source: snapshot.source,
      skills: snapshot.skills.map(({ name, description }) => {
        const winner = this.active.get(name)!.source;
        return winner === snapshot.source ? { name, description } : { name, description, overriddenBy: winner };
      }),
      issues: snapshot.issues.map(issue => ({ ...issue })),
    })) };
  }

  /** Model-visible refresh result: effective skill count and discovery issues. */
  summary() {
    return { count: this.active.size, issues: this.snapshots.flatMap(snapshot => snapshot.issues.map(issue => ({ ...issue }))) };
  }

  prompt(): PromptBlock {
    return { ...this.instructions };
  }

  async read(args: SkillReadArgs, signal: AbortSignal) {
    signal.throwIfAborted();
    const skill = this.active.get(args.name)?.entry;
    if (!skill) throw new SkillError("skill_not_found", `Skill "${args.name}" is absent from the loaded catalog. skill_refresh rebuilds it from installed skills.`);
    const file = skillFile(skill.directory, args.path);
    const { text } = await readTextFile(file, signal);
    return { name: skill.name, path: args.path, directory: skill.directory,
      ...readText(text, false, { offset: args.offset, limit: args.limit, maxBytes: 64 * 1024 }) };
  }
}

function skillCatalogPrompt(skills: readonly SkillMetadata[]): PromptBlock {
  return { id: builtin.name("skills"), kind: "system", from: builtin.name("skills"),
    text: [
      "Skill catalog. Each entry supplies a skill name and description.",
      "The catalog is built at startup. Settings refresh and skill_refresh rebuild it; subsequent requests receive the updated catalog.",
      "skill_read reads SKILL.md and supporting UTF-8 files by skill name and package-relative path, with optional offset and limit in lines. Its result includes the skill's absolute directory.",
      "Relative references in a skill are based on its directory. Script execution and resource operations use the available tools and linked resources.",
      JSON.stringify(skills.map(({ name, description }) => ({ name, description }))),
    ].join("\n") };
}
