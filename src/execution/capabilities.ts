import type { AgentConfiguration } from "../shared/configuration.ts";
import type { Json } from "../shared/model.ts";
import type { ToolInvocationInfo } from "@asterism-app/sdk/contracts";
import type { FoldedObject } from "../session/fold.ts";
import type { ResourceRegistry } from "../resources/registry.ts";
import type { ToolRegistry } from "../tools/registry.ts";
import type { Invocation, PreparedResult, ToolImplementation } from "../tools/contract.ts";
import { projectTool, schemaOf } from "../tools/definition.ts";
import type { ToolCaller } from "@asterism-app/sdk/runtime";

/** External tool policy; support relationships, resource links, and this policy are checked independently. */
export type ToolPolicy = (name: string) => boolean;
export function agentToolPolicy(agent: Pick<AgentConfiguration, "tools" | "excludeTools">): ToolPolicy {
  const allowed = agent.tools === null ? null : new Set(agent.tools);
  const excluded = new Set(agent.excludeTools ?? []);
  return name => (allowed === null || allowed.has(name)) && !excluded.has(name);
}
const denied = (): PreparedResult => ({ kind: "rejected", error: { code: "access_denied", message: "Resource access requires a link to the executing object." } });

/** Per-request capability view: linked resources × tool support, filtered by external policy. Resource and tool catalogs are independent. */
export class AgentCapabilities {
  private readonly linked = new Map<string, { resource: FoldedObject; tools: readonly ToolImplementation[] }>();
  private readonly caller?: ToolCaller;
  constructor(private readonly resources: ResourceRegistry, tools: ToolRegistry,
    linked: readonly FoldedObject[], policy: ToolPolicy, caller?: ToolCaller) {
    this.caller = caller && Object.freeze({ ref: Object.freeze({ ...caller.ref }), title: caller.title });
    for (const source of linked) {
      const resource = structuredClone(source);
      this.linked.set(resource.id, { resource, tools: tools.match(resource).filter(implementation => policy(implementation.tool.name))
        .map(implementation => this.caller ? implementation.capture?.(resource, this.caller) ?? implementation : implementation) });
    }
  }

  list(): Json {
    return [...this.linked.values()].map(({ resource }) => ({ resource_id: resource.id, type: resource.kind, title: resource.title }));
  }

  describe(id: string): Json {
    return (this.linked.get(id)?.tools ?? []).map(implementation => ({
      ...projectTool(implementation.tool), implementation: implementation.reference,
      target: schemaOf(implementation.targetSchema), result: schemaOf(implementation.resultSchema),
    }));
  }

  identity(id: string): ToolInvocationInfo {
    const resource = this.linked.get(id)?.resource;
    return resource ? { resource: { id: resource.id, kind: resource.kind, title: resource.title } } : {};
  }

  /** Look up display identity within this request only; does not parse arguments, prepare, or execute tools. */
  preview(id: string, name: string): ToolInvocationInfo {
    const implementation = this.linked.get(id)?.tools.find(tool => tool.tool.name === name);
    return { ...this.identity(id), ...(implementation ? { implementation: implementation.reference } : {}) };
  }

  async inspect(id: string): Promise<PreparedResult> {
    const target = this.linked.get(id);
    if (!target) return denied();
    const value = { resource_id: id, state: await this.resources.inspect(target.resource), tools: this.describe(id) };
    return { kind: "succeeded", data: value };
  }

  resolve(id: string, name: string, selector: Json, args: Json): Invocation | PreparedResult {
    const target = this.linked.get(id);
    if (!target) return denied();
    const tool = target.tools.find(implementation => implementation.tool.name === name);
    if (!tool && !this.resources.has(target.resource.kind)) return { ...this.identity(id), kind: "rejected", error: { code: "implementation_missing",
      message: `The plugin providing ${target.resource.kind} is unavailable.` } };
    if (!tool) return { ...this.identity(id), kind: "rejected", error: { code: "tool_unavailable", message: "This tool is unavailable for the resource." } };
    if (!this.caller) throw new Error("Tool execution requires a bound caller.");
    return { ...tool.prepare(target.resource, selector, args, this.caller), ...this.identity(id) };
  }
}
