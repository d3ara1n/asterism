import { builtin } from "@asterism-app/builtin-api/contracts";
import type { AgentPromptBlock } from "@asterism-app/builtin-api/contracts";
import { PluginApiError, type AgentCatalog, type AgentSkill, type AgentSkillSource } from "@asterism-app/sdk/runtime";
import { readText } from "../shared/text.ts";
import type { SkillMetadata, SkillReadArgs } from "./contract.ts";

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const priority = (source: AgentSkillSource) => source.plugin === null ? 2 : source.plugin === builtin.id ? 0 : 1;
/** Builtin's override policy is independent of the host's raw source catalog. */
export function effectiveSkills(sources: readonly AgentSkillSource[]): AgentSkill[] {
  const ordered = [...sources].sort((a, b) => priority(a) - priority(b) || compare(a.plugin ?? a.id, b.plugin ?? b.id) || compare(a.id, b.id));
  const active = new Map<string, AgentSkill>();
  for (const source of ordered) for (const skill of source.skills) active.set(skill.name, skill);
  return [...active.values()].sort((a, b) => compare(a.name, b.name));
}

/** Prepared requests hold package identities until their model call and tool batch have settled. */
export class SkillCatalog {
  private requests = new Map<string, readonly AgentSkill[]>();
  constructor(readonly catalog: AgentCatalog) {}
  skills(): AgentSkill[] { return effectiveSkills(this.catalog.skills()); }
  refresh(signal: AbortSignal): void { this.catalog.refresh(signal); }
  summary() { return { count: this.skills().length, issues: this.catalog.skills().flatMap(source => source.issues) }; }
  async during<T>(objectId: string, work: (bind: (skills: readonly AgentSkill[]) => void) => Promise<T>): Promise<T> {
    try { return await work(skills => this.requests.set(objectId, skills)); }
    finally { this.requests.delete(objectId); }
  }
  async read(objectId: string, args: SkillReadArgs, signal: AbortSignal) {
    const skill = this.requests.get(objectId)?.find(skill => skill.name === args.name);
    if (!skill) throw new PluginApiError("rejected", `Skill "${args.name}" is absent from this request's prepared catalog.`, "skill_not_found");
    const text = await this.catalog.read(skill, args.path, signal);
    return { name: skill.name, path: args.path, directory: skill.directory,
      ...readText(text, false, { offset: args.offset, limit: args.limit, maxBytes: 64 * 1024 }) };
  }
}

export function skillCatalogPrompt(skills: readonly SkillMetadata[]): AgentPromptBlock {
  return { id: builtin.name("skills"), kind: "system", from: builtin.name("skills"), source: { id: builtin.name("skills"), plugin: builtin.id },
    text: [
      "Skill catalog. Each entry supplies a skill name and description.",
      "The catalog is captured at request start. Settings refresh and skill_refresh rebuild the shared sources; subsequent requests receive the updated catalog.",
      "skill_read reads SKILL.md and supporting UTF-8 files by skill name and package-relative path, with optional offset and limit in lines. Its result includes the skill's absolute directory.",
      "Relative references in a skill are based on its directory. Script execution and resource operations use the available tools and linked resources.",
      JSON.stringify(skills.map(({ name, description }) => ({ name, description }))),
    ].join("\n") };
}
