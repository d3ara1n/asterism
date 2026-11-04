import { z } from "zod";
import { coreId } from "../shared/core.ts";
import { jsonSchema, toolInvocationSchema, toolCompletionSchema } from "@asterism-app/sdk/contracts";
import { defineTool } from "@asterism-app/sdk/contracts";
import { contractReferenceSchema, defineData } from "@asterism-app/sdk/contracts";
import { jsonArgumentHint } from "./validation.ts";

export const ResourceListResult = defineData(coreId("resource-list"), z.strictObject({
  resources: z.array(z.strictObject({ resource_id: z.string(), type: z.string(), title: z.string(), state: jsonSchema })),
}));
export const ResourceInspectResult = defineData(coreId("resource-inspect"), z.strictObject({
  resource_id: z.string(),
  state: jsonSchema,
  notice: z.string().optional(),
  tools: z.array(z.strictObject({
    name: z.string(), description: z.string(), guidelines: z.array(z.string()), args: jsonSchema,
    requiresInteraction: z.boolean().optional().describe("True when this tool requires a user interaction surface."),
    implementation: contractReferenceSchema, target: jsonSchema, result: jsonSchema,
  })),
}));

export const scriptCallSchema = toolInvocationSchema.extend({
  id: z.string(),
  name: z.string(),
  tool: z.string().optional(),
  kind: z.enum(["queued", "running", ...toolCompletionSchema.options.map(option => option.shape.kind.value)]),
  error: z.strictObject({ code: z.string(), message: z.string() }).optional(),
  message: z.string().optional(),
});
export type ScriptCall = z.infer<typeof scriptCallSchema>;
export const ResourceScriptResult = defineData(coreId("resource-script"), z.strictObject({
  calls: z.array(scriptCallSchema),
  value: jsonSchema.optional(),
}).describe("Nested call identities, timing and outcomes, and the script's final return value."));

export const ResourceScript = defineTool({
  id: "core.tool.resource_script",
  name: "resource_script",
  description: "Run JavaScript to organize resource tool calls and return selected results.",
  guidelines: [
    "code runs as an async function body with top-level await and return. resources.get(resource_id) creates a local resource handle. handle.<tool>({ target, args }) invokes that tool on the selected resource, for example const directory = resources.get(id); return text(await directory.read({ target: { path: \"README.md\" }, args: {} }));",
    "Resource methods bind resource identity and tool name; target and args retain their ordinary JSON contracts and defaults. They return the same structured outcomes as direct calls, including kind, data, model, and invocation identity. Resource handles have no then or toJSON operation methods.",
    "tools.<name>(args) calls the other noninteractive top-level tools available in this request, including resource_list, resource_inspect, and resource_create when available. Resource operation calls use resources.get(id).<tool>({ target, args }).",
    "Tools marked requiresInteraction: true are available through direct model calls, not scripts. They are absent from tools, and resource methods reject them in a script. resource_inspect includes each resource tool's requiresInteraction flag.",
    "text(result) returns the text parts of that result's existing model projection as one string. It does not publish output. Return values can be JSON values; strings remain text. Only the final return value reaches the model.",
    "await expresses dependencies; Promise.all and Promise.allSettled submit concurrent calls. The shared dispatcher preserves sequential tools' submission order while parallel tools can run concurrently.",
    "All calls use this request's captured resource access, configuration, and tool policy. The script environment has no Node APIs, filesystem, network, timers, or session handle.",
    "Script completion, failure, timeout, or cancellation cancels outstanding calls and releases the script environment. Completed effects remain. Nested call summaries are recorded without their arguments or output.",
  ],
  argsSchema: z.strictObject({
    code: z.string().describe("JavaScript async function body. Return the data or text to send back to the model."),
    timeout_ms: z.number().int().positive().optional().describe("Optional deadline for the whole script, including tool calls, in milliseconds."),
  }).describe("JavaScript source and an optional execution deadline."),
});

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
    "A tool name identifies an operation. Across resources that expose the same tool, its meaning and args schema remain consistent.",
    "resource_id selects the resource, args supplies the operation's shared parameters, and target selects content, scope, or a resource-specific view. Available tools, target schemas, and result schemas can differ by resource; resource_inspect describes them for the selected resource.",
    "Domain qualifiers in tool names describe the operation's scope, such as terminal_input for terminal interaction.",
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
