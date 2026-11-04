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
    "code runs as an async function body with top-level await and return. For example: const directory = resources.get(id); const result = await directory.read({ target: { path: \"README.md\" }, args: {} }); return { kind: result.kind, text: text(result) };",
    "resources.get(resource_id) creates a local handle without making a tool call. handle.<tool>({ target, args }) binds the resource identity and tool name; target and args follow the contracts and defaults described by resource_inspect. Handles reserve then and toJSON for JavaScript interoperability.",
    "tools.<name>(args) calls the other noninteractive top-level tools available in this request, including resource_list, resource_inspect, and resource_create when available. Resource operations use handle methods. Tools marked requiresInteraction: true use direct model calls; top-level script bindings omit them and resource methods return a rejected outcome.",
    "Each tool call returns the same structured outcome as a direct call, including kind, data, model, and invocation identity. kind is succeeded (success), partial (partial success), rejected (call rejected), failed (execution failed), cancelled (call cancelled), or unknown (the operation's outcome is uncertain and effects may have occurred). data may be null; its presence alone does not indicate success.",
    "rejected and failed outcomes carry error: { code, message }; partial, cancelled, and unknown outcomes carry message. Tool outcomes fulfill the call's promise for every kind, so await returns unsuccessful outcomes for branching and try/catch handles JavaScript exceptions. A child tool's unsuccessful outcome alone leaves the script running and can be returned by a successful script.",
    "await expresses dependencies; Promise.all and Promise.allSettled submit calls together. Tool outcomes such as failed or rejected are fulfilled promise values: Promise.all returns them normally, and Promise.allSettled reports status: \"fulfilled\" with the tool outcome in value. One unsuccessful tool outcome leaves other submitted calls running.",
    "Direct calls and all script child calls in the same tool batch share a scheduler. Sequential tools share one queue in submission order; parallel tools can run alongside sequential and other parallel tools. Concurrent submission creates no implicit dependency between calls.",
    "text(result) joins the text parts of the result's existing model projection into one string without publishing it. The script's final return value supplies its model output; strings remain text and other JSON values become JSON text. Child outputs reach the model through that return value. An omitted or nullish return becomes null; return values use JSON serialization.",
    "Each script has an isolated JavaScript environment. All calls use this request's captured resource access, configuration, and tool policy. Filesystem, network, and process operations use tools; the environment provides JavaScript and the declared helpers, without Node APIs, direct filesystem or network access, timers, or a session handle.",
    "An uncaught JavaScript exception or return-value serialization failure ends the script with kind: \"failed\" and error.code: \"script_failed\". timeout_ms covers the whole script, including tool calls, and expiry produces error.code: \"script_timeout\". External cancellation produces kind: \"cancelled\".",
    "Script completion, failure, timeout, or cancellation cancels outstanding child calls, waits for them to settle, and releases the script environment. Unawaited calls share this lifetime. Completed effects remain without rollback. History records nested call identities, timing, and outcome summaries without child arguments or outputs.",
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
