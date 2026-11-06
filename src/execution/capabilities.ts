import type { Json } from "../shared/model.ts";
import type { ToolInvocationInfo } from "@asterism-app/sdk/contracts";
import type { FoldedObject } from "../session/fold.ts";
import type { ResourceRegistry } from "../resources/registry.ts";
import type { ToolRegistry } from "../tools/registry.ts";
import type { Invocation, PreparedResult, ToolImplementation } from "../tools/contract.ts";
import { projectTool, schemaOf } from "../tools/definition.ts";
import { interactionUnavailable } from "../tools/result.ts";
import type { ToolCaller } from "@asterism-app/sdk/runtime";

/** External tool policy; support relationships, resource links, and this policy are checked independently. */
export type ToolPolicy = (name: string) => boolean;
const denied = (): PreparedResult => ({ kind: "rejected", error: { code: "access_denied", message: "Resource access requires a link to the executing object." } });
/** `full` returns guidance and schemas, `prompt` only guidance, `schema` only schemas. */
export type InspectDetail = "full" | "prompt" | "schema";
export interface InspectSelection { tools?: readonly string[]; detail?: InspectDetail }

/** Per-request capability view: linked resources × tool support, filtered by external policy. Resource and tool catalogs are independent. */
export class AgentCapabilities {
  private readonly linked = new Map<string, { resource: FoldedObject; tools: readonly ToolImplementation[] }>();
  private readonly caller?: ToolCaller;
  constructor(private readonly resources: ResourceRegistry, tools: ToolRegistry,
    linked: readonly FoldedObject[], policy: ToolPolicy, caller?: ToolCaller, private readonly interactive = true,
    private readonly resourcePolicy: (kind: string) => boolean = () => true) {
    this.caller = caller && Object.freeze({ ...caller, ref: Object.freeze({ ...caller.ref }) });
    for (const source of linked) {
      const resource = structuredClone(source);
      this.linked.set(resource.id, { resource, tools: tools.match(resource).filter(implementation => policy(implementation.tool.name))
        .map(implementation => this.caller && (interactive || !implementation.tool.requiresInteraction)
          ? implementation.capture?.(resource, this.caller) ?? implementation : implementation) });
    }
  }

  async list(): Promise<Json> {
    return Promise.all([...this.linked.values()].map(async ({ resource }) => {
      const notice = this.resourceToolRestriction(resource.kind);
      return {
        resource_id: resource.id, type: resource.kind, title: resource.title,
        state: await this.resources.inspect(resource), ...(notice ? { notice } : {}),
      };
    }));
  }

  private catalog(id: string): readonly ToolImplementation[] {
    return (this.linked.get(id)?.tools ?? []).filter(implementation => this.interactive || !implementation.tool.requiresInteraction);
  }

  /** Project tools for the model. `detail` chooses guidance, schemas, or both; `tools` narrows the listing and an empty selection returns none. */
  describe(id: string, selection: InspectSelection = {}): Json[] {
    return this.project(this.catalog(id), selection);
  }

  private project(available: readonly ToolImplementation[], { tools, detail = "full" }: InspectSelection): Json[] {
    const chosen = tools ? available.filter(implementation => tools.includes(implementation.tool.name)) : available;
    return chosen.map((implementation): Json => {
      const { name, description, guidelines, args, requiresInteraction } = projectTool(implementation.tool);
      const tool: Record<string, Json> = { name, implementation: implementation.reference };
      if (detail !== "schema") { tool.description = description; tool.guidelines = guidelines; }
      if (detail !== "prompt") { tool.args = args; tool.target = schemaOf(implementation.targetSchema); }
      // Availability is guidance for choosing a tool, so it survives both narrowed projections.
      if (requiresInteraction) tool.requiresInteraction = true;
      return tool;
    });
  }

  identity(id: string): ToolInvocationInfo {
    const resource = this.linked.get(id)?.resource;
    return resource ? { resource: { id: resource.id, kind: resource.kind, title: resource.title } } : {};
  }

  /** Look up display identity within this request only; does not parse arguments, prepare, or execute tools. */
  preview(id: string, name: string): ToolInvocationInfo {
    const implementation = this.linked.get(id)?.tools.find(tool => tool.tool.name === name && (this.interactive || !tool.tool.requiresInteraction));
    return { ...this.identity(id), ...(implementation ? { implementation: implementation.reference } : {}) };
  }

  async inspect(id: string, selection: InspectSelection = {}): Promise<PreparedResult> {
    const target = this.linked.get(id);
    if (!target) return denied();
    const available = this.catalog(id);
    const names = available.map(implementation => implementation.tool.name);
    // Unknown names are reported with the current catalog so a stale name is corrected rather than silently dropped.
    const unknown = selection.tools?.filter(name => !names.includes(name)) ?? [];
    if (unknown.length) return { kind: "rejected", error: { code: "invalid_arguments",
      message: `Unknown tools: ${unknown.join(", ")}. Available tools: ${names.join(", ") || "none"}.` } };
    const notice = this.resourceToolRestriction(target.resource.kind);
    const value = { resource_id: id, state: await this.resources.inspect(target.resource), tools: this.project(available, selection),
      ...(notice ? { notice } : {}) };
    return { kind: "succeeded", data: value };
  }

  resourceToolRestriction(kind: string): string | null {
    if (this.resourcePolicy(kind)) return null;
    return this.caller?.agent === undefined
      ? "This execution cannot call tools on this resource."
      : `Agent role "${this.caller.agent}" cannot call tools on this resource.`;
  }

  resolve(id: string, name: string, selector: Json, args: Json, interactive = this.interactive): Invocation | PreparedResult {
    const target = this.linked.get(id);
    if (!target) return denied();
    const restriction = this.resourceToolRestriction(target.resource.kind);
    if (restriction) return { ...this.identity(id), kind: "rejected", error: { code: "access_denied", message: restriction } };
    const tool = target.tools.find(implementation => implementation.tool.name === name);
    if (!tool && !this.resources.has(target.resource.kind)) return { ...this.identity(id), kind: "rejected", error: { code: "implementation_missing",
      message: `The plugin providing ${target.resource.kind} is unavailable.` } };
    if (!tool) return { ...this.identity(id), kind: "rejected", error: { code: "tool_unavailable", message: "This tool is unavailable for the resource." } };
    const canInteract = this.interactive && interactive;
    if (!canInteract && tool.tool.requiresInteraction) return { ...this.identity(id), ...interactionUnavailable() };
    if (!this.caller) throw new Error("Tool execution requires a bound caller.");
    return { ...tool.prepare(target.resource, selector, args, this.caller, canInteract), ...this.identity(id) };
  }
}
