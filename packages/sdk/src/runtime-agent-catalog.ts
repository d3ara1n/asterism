import type { PluginModule } from "./runtime-contracts.ts";

/** The host stamps plugin provenance; a null plugin identifies a user directory. */
export type AgentSource = { id: string; plugin: string | null; directory: string };
export type AgentSkill = { name: string; description: string; directory: string; source: AgentSource };
export type AgentSkillSource = AgentSource & {
  skills: AgentSkill[];
  issues: { file: string; message: string }[];
};
export type AgentInstruction = { id: string; plugin: string; text: string };
export interface AgentSkillDeclaration { id: string; path: string }
export interface AgentInstructionDeclaration { id: string; text: string }
export interface AgentCatalog {
  skills(): readonly AgentSkillSource[];
  instructions(): readonly AgentInstruction[];
  refresh(signal: AbortSignal): readonly AgentSkillSource[];
  /** Read current UTF-8 contents from the captured skill package, independently of later catalog refreshes. */
  read(skill: AgentSkill, path: string, signal: AbortSignal): Promise<string>;
}
/** Package-relative skill directories; the host supplies the actual contributor identity. */
export function defineAgentSkills(entries: readonly AgentSkillDeclaration[]): PluginModule {
  return { setup: () => ({ agentSkills: entries }) };
}
/** Fixed instruction contributions, assembled into requests by the consuming paradigm. */
export function defineAgentInstructions(entries: readonly AgentInstructionDeclaration[]): PluginModule {
  return { setup: () => ({ agentInstructions: entries }) };
}
