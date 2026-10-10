import { z } from "zod";
import { coreId } from "../shared/core.ts";
import { jsonSchema } from "../shared/json.ts";
import { defineTool } from "../shared/module-contract.ts";
import { contractReferenceSchema, defineData } from "../shared/presentation.ts";
import { jsonArgumentHint } from "./validation.ts";

export const ResourceListResult = defineData(coreId("resource-list"), 1, z.strictObject({
  resources: z.array(z.strictObject({ resource_id: z.string(), type: z.string(), title: z.string() })),
}));
export const ResourceInspectResult = defineData(coreId("resource-inspect"), 1, z.strictObject({
  resource_id: z.string(),
  state: jsonSchema,
  tools: z.array(z.strictObject({
    name: z.string(), description: z.string(), guidelines: z.array(z.string()), args: jsonSchema,
    implementation: contractReferenceSchema, target: jsonSchema, result: jsonSchema,
  })),
}));

/** 固定入口共用工具契约，但由执行层装配，不注册到可扩展的资源工具目录。 */
export const ResourceList = defineTool({
  name: "resource_list",
  description: "List resources currently linked to you.",
  guidelines: [
    "Use this control when you need to discover authorized resource IDs, types and titles.",
    "Inspect a selected resource to obtain its live state and available tool definitions.",
    "Only linked resources are listed; visibility on the workbench does not grant access.",
  ],
  argsSchema: z.strictObject({}).describe("No parameters; pass an empty object."),
});

export const ResourceInspect = defineTool({
  name: "resource_inspect",
  description: "Inspect a linked resource's live state and available tools.",
  guidelines: [
    "Use the tool descriptions to choose an operation, then follow its guidelines and args schema.",
    "Use the selected implementation's target schema to locate the object and its result schema to interpret the returned data.",
    "Inspect again when live resource state matters or the available definitions need refreshing.",
  ],
  argsSchema: z.strictObject({
    resource_id: z.string().min(1).describe("The opaque ID of a resource currently linked to this agent."),
  }).describe("Identify the linked resource whose live state and available tool definitions are needed."),
});

export const ResourceCall = defineTool({
  name: "resource_call",
  description: "Use an available tool on a linked resource.",
  guidelines: [
    "Choose the resource and tool using the link notification or resource_inspect; obtain missing definitions before calling.",
    "Follow the selected tool's guidelines and shared args schema; target follows that resource implementation's schema.",
    "Omitting target is equivalent to null; this is valid only when the implementation accepts null.",
    jsonArgumentHint,
    "A tool's availability does not bypass resource authorization. Use the outcome to decide whether to continue, correct arguments or ask the user to resolve the failure.",
  ],
  argsSchema: z.strictObject({
    resource_id: z.string().min(1).describe("The opaque ID of a resource currently linked to this agent."),
    tool: z.string().min(1).describe("An available resource tool name supplied by the link notification or resource_inspect."),
    target: jsonSchema.default(null).describe("A JSON value matching this resource tool's target schema from resource_inspect. Pass objects directly, e.g. {\"path\":\"subdir\"}; use null only when supported. Do not JSON-encode the value into a string."),
    args: jsonSchema.default({}).describe("A JSON value matching the tool's args schema from resource_inspect. Pass an object directly when the schema requires one, e.g. {}. Do not JSON-encode the value into a string."),
  }).describe("Select a linked resource and a tool, then supply its implementation-specific target and shared operation args."),
});
