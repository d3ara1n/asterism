import { z } from "zod";
import { defineCall, defineEvent } from "@asterism-app/sdk/contracts";
import { coreId } from "./core.ts";

const source = z.strictObject({ id: z.string(), plugin: z.string().nullable(), directory: z.string() });
export const skillSourcesSchema = z.array(source.extend({
  skills: z.array(z.strictObject({ name: z.string(), description: z.string(), directory: z.string(), source })),
  issues: z.array(z.strictObject({ file: z.string(), message: z.string() })),
}));
export type SkillSource = z.infer<typeof skillSourcesSchema>[number];
export const ReadSkills = defineCall(coreId("skills.read"), { scope: "plugin", input: z.strictObject({}), output: skillSourcesSchema });
export const RefreshSkills = defineCall(coreId("skills.refresh"), { scope: "plugin", input: z.strictObject({}), output: skillSourcesSchema });
export const SkillsChanged = defineEvent(coreId("skills.changed"), { schema: skillSourcesSchema, source: "host", semantics: { kind: "snapshot", key: [] } });
