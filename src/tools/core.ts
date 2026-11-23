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
    description: z.string().optional().describe("Present in the default view."),
    guidelines: z.array(z.string()).optional().describe("Present in the default view."),
    args: jsonSchema.optional().describe("Present in the default and schema views."),
    target: jsonSchema.optional().describe("Present in the default and schema views."),
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
  description: "Compose tool calls in JavaScript using their results, conditional logic, loops, and concurrency. Return selected values to the model.",
  guidelines: [
    "code is an async JavaScript function body with top-level await and return. Intermediate values are available to the script as local variables.",
    "tools.<name>(args) calls a top-level tool exposed to the script. Object.keys(tools) lists these bindings. For example: const r = await tools.resource_inspect({ resource_id }); on success, r.data contains state and tools.",
    "resources.get(resource_id) creates a local call handle, separate from tool discovery. Invoke handle.read({ target, args }) or select a tool dynamically with handle[name]({ target, args }). Definitions from resource_inspect supply name and the target and args schemas. Handle properties then and toJSON are reserved.",
    "Each call resolves to { kind, data } with error: { code, message } for rejected and failed, or message for partial, cancelled, and unknown. kind is succeeded for success and partial for partial success; unknown means effects may have occurred. data is the encoded result and may be null. The result schema from resource_inspect with detail: \"schema\" describes data, not the envelope.",
    "All tool outcome kinds fulfill the promise, including failures. Branch on result.kind; try/catch handles JavaScript exceptions. An unsuccessful child outcome alone leaves the script and other calls running.",
    "text(result) returns the text of the tool's model-facing view. It takes the original result object from a call in the current script. File parts, such as images, are outside this text view.",
    "The model receives child output only through log(value) or return. A whole call result supplies its structured outcome in JSON; text(result) supplies its rendered text. Selected data fields or computed values can also be returned. Strings remain text, other values are serialized as JSON, and an omitted return becomes null.",
    "log(value) records a JSON snapshot for the execution view. Logs reach the model in emission order before the return value and remain available on failure or cancellation. undefined is logged as the string [undefined]; log serialization failures are recorded without stopping the script.",
    "Calls are submitted when invoked. await expresses dependencies; Promise.all can await several outcomes together. Direct and script calls in the same batch share a scheduler: sequential calls run in submission order, and parallel calls can overlap either lane.",
    "Scripts run in isolated QuickJS with standard JavaScript built-ins and host bindings resources, tools, text, and log. Filesystem, network, and process operations are available through tools; Node.js and browser APIs, console, timers, Intl, and module loading are unavailable. Date uses the host clock and local time zone.",
    "Scripts use the request's captured resource access, configuration, and tool policy. New resources and link changes become available on the next model request. Script calls are noninteractive: a requiresInteraction tool can appear in an interactive request's inspection catalog but runs only as a direct call with user interaction available.",
    "A timeout covers the entire script and its calls. Timeout, uncaught JavaScript exceptions, and return serialization failures give kind: failed with code script_timeout or script_failed. External cancellation gives kind: cancelled.",
    "When the script ends, outstanding calls are cancelled and awaited before the environment is released. Completed effects remain. History keeps the script, child call summaries, logs, and return value; child arguments and outputs are temporary unless explicitly logged or returned.",
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
  description: "Read a linked resource's current state and available tool definitions in one call.",
  guidelines: [
    "With only resource_id, the result contains state and tools with all available call definitions. A tool's name, target, and args define a call via resource_call or a resource_script handle.",
    "Resource state is read at inspection time. The tool catalog reflects the links, configuration, and execution policy captured for the request. Tool definitions can be reused while they remain available.",
  ],
  argsSchema: z.strictObject({
    resource_id: z.string().min(1).describe("The opaque ID of a resource currently linked to this agent."),
    tools: z.array(z.string().min(1)).optional().describe("Tool filter: omit for all available definitions, pass exact names for a subset, or pass [] for state only."),
    detail: z.enum(["default", "schema"]).optional().describe("Tool definition view. default (also used when omitted) includes descriptions, guidelines, args, and target. schema includes args, target, and result, the schema for encoded data as seen by scripts."),
  }).describe("Identify the linked resource and optionally select which tool definitions and view to include."),
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
    "If the outer resource_call arguments repeatedly fail schema validation, resource_script offers a different call format for non-interactive resource tools, even for a single call. The script handle binds the resource ID and tool name; target and args still follow the schemas from resource_inspect.",
    jsonArgumentHint,
  ],
  argsSchema: z.strictObject({
    resource_id: z.string().min(1).describe("The opaque ID of a resource currently linked to this agent."),
    tool: z.string().min(1).describe("An available resource tool name supplied by resource_inspect."),
    target: toolInputSchema.default(null).describe("A JSON object or null matching the resource tool's target schema. Example: {\"path\":\"README.md\"}."),
    args: toolInputSchema.default({}).describe("A JSON object or null matching the tool's args schema. Example: {\"title\":\"New title\"}."),
  }).describe("Select a linked resource and a tool, then supply its implementation-specific target and shared operation args."),
});
