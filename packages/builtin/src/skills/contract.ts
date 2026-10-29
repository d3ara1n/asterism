import { z } from "zod";
import { builtin, textReadSchema } from "@asterism-app/builtin-api/contracts";

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

export const SkillRefresh = builtin.data("skill.refresh", z.strictObject({
  count: z.number().int().nonnegative(),
  issues: z.array(skillIssueSchema),
}).describe("Number of skills in the rebuilt catalog and discovery issues by file."));
