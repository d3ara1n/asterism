import { z } from "zod";
import { defineCall } from "@atelier/sdk/contracts";
import { builtin, textReadSchema } from "@atelier/builtin-api/contracts";

export const skillMetadataSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
});
export type SkillMetadata = z.infer<typeof skillMetadataSchema>;
export const skillReadArgsSchema = z.strictObject({
  name: z.string().min(1).describe("Skill name from the system prompt's skill catalog."),
  path: z.string().min(1).default("SKILL.md").describe("UTF-8 file path relative to the selected skill's directory. Defaults to SKILL.md; references and scripts use paths within the same skill package."),
  offset: z.number().int().positive().default(1).describe("First line to read, 1-based in the complete file. Defaults to 1."),
  limit: z.number().int().positive().max(2000).default(1000).describe("Maximum complete lines to read. Defaults to 1000, maximum 2000; output also has a 64 KiB limit."),
}).describe("Select a skill, a file within its package, and a line range.");
export type SkillReadArgs = z.infer<typeof skillReadArgsSchema>;
export const SkillRead = builtin.data("skill.read", textReadSchema.extend({
  name: z.string(),
  path: z.string(),
  directory: z.string(),
}).describe("Selected skill file lines, absolute skill directory, total line count, and nextOffset for remaining text."));

export const skillOverviewSchema = z.strictObject({
  source: z.string(),
  skills: z.array(skillMetadataSchema),
  issues: z.array(z.strictObject({ file: z.string(), message: z.string() })),
}).describe("Loaded skill names and descriptions, source directory, and discovery issues.");
export type SkillOverview = z.infer<typeof skillOverviewSchema>;
export const ReadSkills = defineCall(builtin.name("skills.list"), {
  scope: "plugin", input: z.strictObject({}), output: skillOverviewSchema,
});
export const RefreshSkills = defineCall(builtin.name("skills.refresh"), {
  scope: "plugin", input: z.strictObject({}), output: skillOverviewSchema,
});
export const SkillRefresh = builtin.data("skill.refresh", skillOverviewSchema);
export const SkillsChanged = builtin.event("skills.changed", {
  schema: skillOverviewSchema, source: "plugin", semantics: { kind: "snapshot", key: [] },
});
