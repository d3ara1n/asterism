import { z } from "zod";
import { coreId } from "../shared/core.ts";
import { toolInputSchema, jsonSchema, toolInvocationSchema, toolCompletionSchema } from "@asterism-app/sdk/contracts";
import { defineTool, MAX_TIMEOUT_SECONDS } from "@asterism-app/sdk/contracts";
import { contractReferenceSchema, defineData } from "@asterism-app/sdk/contracts";
import { jsonArgumentHint } from "./validation.ts";

export const ResourceListResult = defineData(coreId("resource-list"), z.strictObject({
  resources: z.array(z.strictObject({ resource_id: z.string(), type: z.string(), title: z.string(), state: jsonSchema, notice: z.string().optional() })),
}));
export const ResourceInspectResult = defineData(coreId("resource-inspect"), z.strictObject({
  resource_id: z.string(),
  state: jsonSchema,
  notice: z.string().optional(),
  tools: z.array(z.strictObject({
    name: z.string(),
    description: z.string().optional().describe("Present unless the inspection requested schemas only."),
    guidelines: z.array(z.string()).optional().describe("Present unless the inspection requested schemas only."),
    args: jsonSchema.optional().describe("Present unless the inspection requested guidance only."),
    target: jsonSchema.optional().describe("Present unless the inspection requested guidance only."),
    result: jsonSchema.optional().describe("Schema for encoded result data, present only in the schema view."),
    requiresInteraction: z.boolean().optional().describe("True when this tool requires a user interaction surface."),
    requiresNotice: z.boolean().optional().describe("True when starting this tool requests user attention once."),
    implementation: contractReferenceSchema,
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
  logs: z.array(jsonSchema).default([]),
  value: jsonSchema.optional(),
}).describe("Nested call identities, timing and outcomes, explicit script logs, and the script's final return value."));

export const ResourceScript = defineTool({
  id: "core.tool.resource_script",
  name: "resource_script",
  description: "Execute JavaScript that chains resource tool calls through their results, with loops, conditional branches, and concurrent work; return selected results to the model.",
  guidelines: [
    "code runs as an async JavaScript function body with top-level await and return. Local variables retain intermediate results within the script.",
    "resources.get(resource_id) creates a local handle without making a tool call. handle.<tool>({ target, args }) binds the resource identity and tool name; target and args follow the contracts described by resource_inspect. Handles reserve then and toJSON for JavaScript interoperability.",
    "tools.<name>(args) calls other noninteractive top-level tools available in this request, including resource_list, resource_inspect, and resource_create when available. Resource operations use handle methods.",
    "Each call returns the same structured outcome as a direct call, including kind, data, model, and invocation identity. data is the encoded tool result; resource_inspect with detail: \"schema\" describes its shape. data may be null; its presence alone does not indicate success.",
    "An earlier result can supply the target or args of later calls, including calls on other resources. JavaScript loops, filters, transformations, and branches can select subsequent operations and aggregate their results before returning to the model.",
    "Example for a directory with the discovered glob and metadata contracts: const d = resources.get(id); const found = await d.glob({ args: { pattern: \"*.md\" } }); if (found.kind !== \"succeeded\") return found; return await Promise.all(found.data.files.map(async path => { const result = await d.metadata({ target: { path } }); return { path, kind: result.kind, text: text(result) }; }));",
    "await expresses dependencies; Promise.all and Promise.allSettled submit calls together. Direct calls and script child calls in the same tool batch share a scheduler. Sequential tools share one queue in submission order; parallel tools can run alongside sequential and other parallel tools. Concurrent submission creates no implicit dependency between calls.",
    "Terminal kinds are succeeded (success), partial (partial success), rejected (call rejected), failed (execution failed), cancelled (call cancelled), and unknown (effects may have occurred). rejected and failed carry error: { code, message }; partial, cancelled, and unknown carry message.",
    "Tool outcomes fulfill the call's promise for every kind, so branches on result.kind handle unsuccessful calls and try/catch handles JavaScript exceptions. Promise.all returns unsuccessful outcomes normally; Promise.allSettled reports them as status: \"fulfilled\" with the outcome in value. A child failure alone leaves the script and other submitted calls running.",
    "text(result) joins the text parts of a result's existing model projection without publishing it. The script's return value supplies its final model output: strings remain text, other JSON values become JSON text, and an omitted or nullish value becomes null.",
    "log(value) synchronously captures one JSON-serializable value and returns undefined; later mutations leave earlier entries unchanged. Logs appear in the execution view as they arrive; the model receives them in emission order followed by the return value when the script finishes. Child outputs reach the model through explicit logs or return. Log serialization errors throw catchable JavaScript exceptions; log content does not change execution status.",
    "Each script has an isolated QuickJS environment with standard JavaScript built-ins, including JSON, Math, Date, RegExp, Map, Set, Promise, typed arrays, and URI encoding functions. Date.now() and new Date() read the system clock; local Date methods use the host's local time zone.",
    "Application-provided globals are resources, tools, text, and log. Filesystem, network, and process operations are available through tools rather than Node.js or browser APIs; the VM also omits console, timers, Intl, and module loading. All calls use this request's captured resource access, configuration, and tool policy; resources and links created during execution become available on the next model request.",
    "Script calls receive a noninteractive execution context. Tools marked requiresInteraction: true use direct model calls; script top-level bindings omit them and resource methods reject them.",
    "An omitted timeout sets no deadline. A supplied timeout is in seconds and covers the entire script, including tool calls; expiry produces kind: \"failed\" and error.code: \"script_timeout\". External cancellation produces kind: \"cancelled\".",
    "An uncaught JavaScript exception or return-value serialization failure ends the script with kind: \"failed\" and error.code: \"script_failed\".",
    "Script completion, failure, timeout, or cancellation cancels outstanding child calls, waits for them to settle, and releases the script environment. Unawaited calls share this lifetime. Completed effects remain without rollback. History retains the code, child call identities, timing and outcome summaries, logs, and return value; child arguments and outputs are temporary unless logged or returned. Emitted logs remain available after failure, timeout, or cancellation.",
  ],
  argsSchema: z.strictObject({
    code: z.string().describe("JavaScript async function body. Use log(value) for intermediate output and return for the final data or text to send back to the model."),
    timeout: z.number().positive().max(MAX_TIMEOUT_SECONDS).optional().describe("Optional deadline for the whole script, including tool calls, in seconds; omitted means no timeout."),
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
    "Omitting tools returns all available tool definitions for the resource. tools: [] returns resource state without tool definitions.",
    "A non-empty tools array selects exact tool names from a previously discovered catalog.",
    'In the schema view, result describes encoded outcome.data, not the outcome envelope or its model-facing text.',
    "Resource state is read at inspection time. The tool catalog is captured for the request; resource state changes do not by themselves change tool definitions.",
    "Previously returned definitions remain usable without another inspection. Links, configuration, and execution policy are captured at request boundaries.",
  ],
  argsSchema: z.strictObject({
    resource_id: z.string().min(1).describe("The opaque ID of a resource currently linked to this agent."),
    tools: z.array(z.string().min(1)).optional().describe("Exact names of previously discovered tools to include. Omit to discover all available tools; [] returns state only."),
    detail: z.enum(["default", "prompt", "schema"]).optional().describe("Inspection view. default (also when omitted) returns description, guidelines, args and target schemas; prompt returns description and guidelines; schema returns args, target and result data schemas."),
  }).describe("Identify the linked resource, and optionally narrow which tool definitions and which view of each definition to return."),
});

export const ResourceCall = defineTool({
  id: "core.tool.resource_call",
  name: "resource_call",
  description: "Use an available tool on a linked resource.",
  guidelines: [
    "A tool name identifies an operation. Across resources that expose the same tool, its meaning and args schema remain consistent.",
    "resource_id selects the resource, args supplies the operation's shared parameters, and target selects content, scope, or a resource-specific view. Available tools and target schemas can differ by resource; resource_inspect describes them for the selected resource.",
    "Domain qualifiers in tool names describe the operation's scope, such as terminal_input for terminal interaction.",
    "Omitting target is equivalent to null; this is valid only when the implementation accepts null.",
    jsonArgumentHint,
  ],
  argsSchema: z.strictObject({
    resource_id: z.string().min(1).describe("The opaque ID of a resource currently linked to this agent."),
    tool: z.string().min(1).describe("An available resource tool name supplied by resource_inspect."),
    target: toolInputSchema.default(null).describe("A JSON object or null matching the resource tool's target schema. Example: {\"path\":\"README.md\"}."),
    args: toolInputSchema.default({}).describe("A JSON object or null matching the tool's args schema. Example: {\"title\":\"New title\"}."),
  }).describe("Select a linked resource and a tool, then supply its implementation-specific target and shared operation args."),
});
