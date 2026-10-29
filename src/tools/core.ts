import { z } from "zod";
import { coreId } from "../shared/core.ts";
import { jsonSchema } from "@asterism-app/sdk/contracts";
import { defineTool } from "@asterism-app/sdk/contracts";
import { contractReferenceSchema, defineData } from "@asterism-app/sdk/contracts";
import { jsonArgumentHint } from "./validation.ts";

export const ResourceListResult = defineData(coreId("resource-list"), z.strictObject({
  resources: z.array(z.strictObject({ resource_id: z.string(), type: z.string(), title: z.string(), state: jsonSchema })),
}));
export const ResourceInspectResult = defineData(coreId("resource-inspect"), z.strictObject({
  resource_id: z.string(),
  state: jsonSchema,
  tools: z.array(z.strictObject({
    name: z.string(), description: z.string(), guidelines: z.array(z.string()), args: jsonSchema,
    implementation: contractReferenceSchema, target: jsonSchema, result: jsonSchema,
  })),
}));

/** Fixed entries share tool contracts but are assembled by execution, outside extensible resource tool catalogs. */
export const ResourceList = defineTool({
  id: "core.tool.resource_list",
  name: "resource_list",
  description: "List resources currently linked to you.",
  guidelines: [
    "The result contains resource IDs, types, titles, and resource-provided state in the current request's resource scope. Tool definitions are returned by resource_inspect.",
  ],
  argsSchema: z.strictObject({}).describe("Empty parameter object."),
});

export const ResourceInspect = defineTool({
  id: "core.tool.resource_inspect",
  name: "resource_inspect",
  description: "Inspect a linked resource's live state and available tools.",
  guidelines: [
    "The result contains live resource state and available tool descriptions, guidelines, and schemas.",
  ],
  argsSchema: z.strictObject({
    resource_id: z.string().min(1).describe("The opaque ID of a resource currently linked to this agent."),
  }).describe("Identify the linked resource whose live state and available tool definitions are needed."),
});

export const ResourceCall = defineTool({
  id: "core.tool.resource_call",
  name: "resource_call",
  description: "Use an available tool on a linked resource.",
  guidelines: [
    "args follows the tool's shared schema. target follows the selected resource implementation's schema.",
    "Omitting target is equivalent to null; this is valid only when the implementation accepts null.",
    jsonArgumentHint,
  ],
  argsSchema: z.strictObject({
    resource_id: z.string().min(1).describe("The opaque ID of a resource currently linked to this agent."),
    tool: z.string().min(1).describe("An available resource tool name supplied by resource_inspect."),
    target: jsonSchema.default(null).describe("A JSON value matching the resource tool's target schema. Objects and null retain their JSON types."),
    args: jsonSchema.default({}).describe("A JSON value matching the tool's args schema. Objects retain their JSON type."),
  }).describe("Select a linked resource and a tool, then supply its implementation-specific target and shared operation args."),
});
