import { z } from "zod";
import { coreId } from "../shared/core.ts";
import { toolInputSchema, jsonSchema, toolInvocationSchema, toolCompletionSchema } from "@asterism-app/sdk/contracts";
import { defineTool, MAX_TIMEOUT_SECONDS, type ToolCallInput } from "@asterism-app/sdk/contracts";
import { contractReferenceSchema, defineData } from "@asterism-app/sdk/contracts";

export const ResourceListResult = defineData(coreId("resource-list"), z.strictObject({
  resources: z.array(z.strictObject({ resource_id: z.string(), type: z.string(), title: z.string(), state: jsonSchema, notice: z.string().optional() })),
}));
export const ResourceInspectResult = defineData(coreId("resource-inspect"), z.strictObject({
  resource_id: z.string(),
  state: jsonSchema,
  notice: z.string().optional(),
  tools: z.array(z.strictObject({
    name: z.string(),
    kind: z.enum(["structured", "freeform"]).optional().describe("Input format; absent only from older inspection results."),
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
    "The tools object exposes top-level calls by name. Structured calls take their declared argument object; freeform calls take a string.",
    "resources.get selects a resource by ID and returns a handle with methods keyed by tool name. Structured methods take one object with target and args fields; freeform methods take a string. resource_inspect reports each tool’s input kind and the target and args schemas for structured tools. Handle properties then and toJSON are reserved.",
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
    "With only resource_id, the result contains state and all available tool definitions.",
    "Each definition reports its input kind. Structured tools use resource_call or a script handle with target and args; freeform tools use resource_call_text or a script handle with one text string.",
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
  description: "Use an available structured tool on a linked resource.",
  guidelines: [
    "resource_id selects the resource; tool selects the operation.",
    "args belongs to the tool. It supplies operation parameters whose schema stays the same across resources that expose the same tool.",
    "target belongs to the tool's implementation on the selected resource. It selects content, scope, filters, or a view; its schema can differ across resources for the same tool.",
    "resource_inspect returns both schemas for the selected resource and tool. Each field goes in the object whose schema declares it.",
    "Domain qualifiers in tool names describe the operation's scope, such as terminal_input for terminal interaction.",
    "Omitting target is equivalent to null; this is valid only when the implementation accepts null.",
  ],
  argsSchema: z.strictObject({
    resource_id: z.string().min(1).describe("The opaque ID of a resource currently linked to this agent."),
    tool: z.string().min(1).describe("An available resource tool name supplied by resource_inspect."),
    target: toolInputSchema.default(null).describe("A JSON object or null matching this tool implementation's target schema on the selected resource."),
    args: toolInputSchema.default({}).describe("A JSON object or null matching the selected tool's shared operation args schema."),
  }).describe("Select a linked resource and a tool, then supply its implementation-specific target and shared operation args."),
});

export const ResourceCallText = defineTool({
  id: "core.tool.resource_call_text",
  kind: "freeform",
  name: "resource_call_text",
  description: "Use an available freeform tool on a linked resource.",
  guidelines: [
    "The first line is <resource_id> <tool>, separated by a single space and terminated by LF or CRLF.",
    "Everything after that line ending is passed unchanged as the tool input, including whitespace, line endings, and an empty body.",
    "resource_inspect identifies freeform tools and describes what their text means. A resource_script handle accepts the body alone as a string.",
  ],
});

export function parseResourceCallText(text: string): { id: string; tool: string; body: string } | null {
  const header = /^([^\s]+) ([^\s]+)\r?\n/.exec(text);
  return header ? { id: header[1]!, tool: header[2]!, body: text.slice(header[0].length) } : null;
}

/** Select the resource tool for usage records and script summaries without recording its input. */
export function resourceToolName(name: string, input: ToolCallInput): string | undefined {
  if (name === ResourceCallText.name && input.kind === "freeform") return parseResourceCallText(input.text)?.tool;
  if (name !== ResourceCall.name || input.kind !== "structured") return undefined;
  const args = input.value;
  return args && typeof args === "object" && !Array.isArray(args) && typeof args.tool === "string" ? args.tool : undefined;
}
