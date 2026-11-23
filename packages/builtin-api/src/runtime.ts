import { z } from "zod";
import { belongsTo, jsonSchema, type CreationContract, type Json, type JsonObject, type SessionDirectory } from "@asterism-app/sdk/contracts";
import { defineModule, PluginApiError, type PluginContext, type PluginModule, type ObjectReader, type TopLevelToolContext } from "@asterism-app/sdk/runtime";

export { agentServices, registerAgentServices, type AgentServices } from "./agent-services.ts";
export { defineAgentPreparer, captureAgentPreparers, type AgentPreparation, type AgentPromptBlock } from "./preparation.ts";
export { defineAgentContextTransform, captureAgentContextTransforms,
  type AgentContextUnit, type AgentContextItem, type AgentContextRequest } from "./context-transform.ts";

/** The Agent's argument envelope; each entry defines the object's fields. */
export const agentCreationInputSchema = z.object({}).catchall(jsonSchema);

export interface AgentCreationDescription {
  readonly id: string;
  readonly resourceKind: string;
  readonly description: string;
  readonly guidelines: readonly string[];
  readonly input: Json;
}
interface Entry {
  readonly description: AgentCreationDescription;
  create(input: JsonObject, context: TopLevelToolContext): ReturnType<TopLevelToolContext["session"]["create"]>;
}
type CreationOptions = Parameters<TopLevelToolContext["session"]["create"]>[2];
/** Catalogs are isolated by host runtime instance; shared public exports do not mix plugin registrations from different hosts. */
const directories = new WeakMap<SessionDirectory, Map<string, Entry>>();
function directory(plugin: PluginContext): Map<string, Entry> {
  plugin.lifetime.signal.throwIfAborted();
  let entries = directories.get(plugin.sessions);
  if (!entries) { entries = new Map(); directories.set(plugin.sessions, entries); }
  return entries;
}
function entry(plugin: PluginContext, id: string): Entry {
  const value = directory(plugin).get(id);
  if (!value) throw new PluginApiError("not_found", "This Agent creation entry is unavailable. Read creation_list for available entries.");
  return value;
}

/** Zod can project object variants as unions and named schemas as local definitions. */
function describesObject(root: z.core.JSONSchema.BaseSchema): boolean {
  function check(schema: z.core.JSONSchema.BaseSchema, refs: readonly string[] = []): boolean {
    if (schema.type === "object" || schema.allOf?.some(branch => check(branch, refs))) return true;
    const variants = schema.anyOf ?? schema.oneOf;
    if (variants?.length && variants.every(branch => check(branch, refs))) return true;
    const ref = schema.$ref;
    if (!ref?.startsWith("#/$defs/") || refs.includes(ref)) return false;
    const name = ref.slice("#/$defs/".length).replaceAll("~1", "/").replaceAll("~0", "~");
    const definition = root.$defs && Object.hasOwn(root.$defs, name) ? root.$defs[name] : undefined;
    return definition !== undefined && check(definition, [...refs, ref]);
  }
  return check(root);
}

/** The domain service shared by built-in creation tools and plugins; querying is not a prerequisite for creation. */
export const agentCreations = {
  list(plugin: PluginContext) {
    return [...directory(plugin).values()].map(({ description: { id, resourceKind, description } }) => ({ id, resourceKind, description }));
  },
  inspect(plugin: PluginContext, id: string): AgentCreationDescription { return structuredClone(entry(plugin, id).description); },
  create(plugin: PluginContext, id: string, input: JsonObject, context: TopLevelToolContext) {
    return entry(plugin, id).create(input, context);
  },
};

/** Agent creation entries accept objects. Use an adapter if the underlying creation takes a different input shape. */
export function defineAgentCreation<I, S extends Json, O extends Json, A extends Json = Json>(definition: {
  id: string;
  description: string;
  guidelines?: readonly string[];
} & ({ creation: CreationContract<I & JsonObject, S, O>; inputSchema?: never; toInput?: never; toOptions?: never } | {
  creation: CreationContract<I, S, O>;
  inputSchema: z.ZodType<A, JsonObject>;
  toInput(input: A, context: { object: ObjectReader }): I & Json;
  toOptions?(input: A, context: { object: ObjectReader }): CreationOptions;
})): PluginModule {
  return defineModule(plugin => {
    if (!belongsTo(plugin.id, definition.id)) throw new PluginApiError("invalid_argument", "The Agent creation entry belongs to another plugin.");
    if (!definition.description.trim()) throw new PluginApiError("invalid_argument", "An Agent creation entry needs a description.");
    const entries = directory(plugin);
    if (entries.has(definition.id)) throw new PluginApiError("conflict", `Duplicate Agent creation entry: ${definition.id}`);
    const projected = z.toJSONSchema(definition.inputSchema ?? definition.creation.schema, { io: "input" });
    if (!describesObject(projected)) throw new PluginApiError("invalid_argument",
      `Agent creation entry ${definition.id} needs an object input schema. Use inputSchema and toInput to adapt other creation inputs.`);
    const input = jsonSchema.parse(projected);
    const value: Entry = {
      description: { id: definition.id, resourceKind: definition.creation.resource.kind,
        description: definition.description, guidelines: [...definition.guidelines ?? []], input },
      create(raw, context) {
        plugin.lifetime.signal.throwIfAborted(); context.signal.throwIfAborted();
        let converted: I & Json;
        let options: CreationOptions;
        if (definition.inputSchema) {
          const parsed = definition.inputSchema.safeParse(raw);
          if (!parsed.success) throw new PluginApiError("invalid_argument", parsed.error.message);
          converted = jsonSchema.parse(definition.toInput(parsed.data, { object: context.object })) as I & Json;
          options = definition.toOptions?.(parsed.data, { object: context.object });
        } else converted = raw as I & Json;
        return context.session.create(definition.creation, converted, options);
      },
    };
    entries.set(definition.id, value);
    // Remove registrations as soon as the plugin aborts: a plugin whose assembly failed must not remain publicly queryable during asynchronous cleanup.
    plugin.lifetime.signal.addEventListener("abort", () => { if (entries.get(definition.id) === value) entries.delete(definition.id); }, { once: true });
    return {};
  });
}
