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
  limit: z.number().int().positive().max(2000).default(1000).describe("Maximum lines to read. Defaults to 1000, maximum 2000; output also has a 64 KiB limit."),
}).describe("Select a skill, a file within its package, and a line range.");
export type SkillReadArgs = z.infer<typeof skillReadArgsSchema>;
export const SkillRead = builtin.data("skill.read", textReadSchema.extend({
  name: z.string(),
  path: z.string(),
  directory: z.string(),
}).describe("Selected skill file lines, absolute skill directory, total line count, and nextOffset for remaining text."));

const skillIssueSchema = z.strictObject({ file: z.string(), message: z.string() });
export type SkillIssue = z.infer<typeof skillIssueSchema>;

/** 来源只是分组与审计用的标识：目录来源为绝对路径，插件来源为插件 ID，软件内置为 builtin。 */
export const skillSourceOverviewSchema = z.strictObject({
  source: z.string(),
  skills: z.array(z.strictObject({
    name: z.string(),
    description: z.string(),
    /** 同名技能由更高优先级来源提供时，记录生效来源。 */
    overriddenBy: z.string().optional(),
  })),
  issues: z.array(skillIssueSchema),
});
export type SkillSourceOverview = z.infer<typeof skillSourceOverviewSchema>;
/** 来源按覆盖优先级从低到高排列：内置、插件、用户目录。 */
export const skillOverviewSchema = z.strictObject({ sources: z.array(skillSourceOverviewSchema) });
export type SkillOverview = z.infer<typeof skillOverviewSchema>;

export const ReadSkills = defineCall(builtin.name("skills.list"), {
  scope: "plugin", input: z.strictObject({}), output: skillOverviewSchema,
});
export const RefreshSkills = defineCall(builtin.name("skills.refresh"), {
  scope: "plugin", input: z.strictObject({}), output: skillOverviewSchema,
});
export const SkillRefresh = builtin.data("skill.refresh", z.strictObject({
  count: z.number().int().nonnegative(),
  issues: z.array(skillIssueSchema),
}).describe("Number of skills in the rebuilt catalog and discovery issues by file."));
export const SkillsChanged = builtin.event("skills.changed", {
  schema: skillOverviewSchema, source: "plugin", semantics: { kind: "snapshot", key: [] },
});
