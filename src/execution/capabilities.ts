import type { AgentConfiguration } from "../shared/configuration.ts";
import type { Json, ToolOutcome } from "../shared/model.ts";
import type { FoldedObject } from "../session/fold.ts";
import type { ResourceRegistry } from "../resources/registry.ts";
import type { ToolRegistry } from "../tools/registry.ts";
import type { Invocation, ToolImplementation } from "../tools/contract.ts";
import { projectTool, schemaOf } from "../tools/definition.ts";

/** 外部工具策略；支持关系、资源链接与这层策略分别判断。 */
export type ToolPolicy = (name: string) => boolean;
export function agentToolPolicy(agent: Pick<AgentConfiguration, "tools" | "excludeTools">): ToolPolicy {
  const allowed = agent.tools === null ? null : new Set(agent.tools);
  const excluded = new Set(agent.excludeTools ?? []);
  return name => (allowed === null || allowed.has(name)) && !excluded.has(name);
}
const denied = (): ToolOutcome => ({ kind: "rejected", error: { code: "access_denied", message: "The resource is not linked to this agent." } });

/** 每次请求的能力视图：链接资源 × 工具支持关系，再由外部策略筛选。资源和工具目录彼此独立。 */
export class AgentCapabilities {
  private readonly linked = new Map<string, { resource: FoldedObject; tools: readonly ToolImplementation[] }>();
  constructor(private readonly resources: ResourceRegistry, tools: ToolRegistry,
    linked: readonly FoldedObject[], policy: ToolPolicy) {
    for (const source of linked) {
      const resource = structuredClone(source);
      this.linked.set(resource.id, { resource, tools: tools.match(resource).filter(implementation => policy(implementation.tool.name)) });
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

  async inspect(id: string): Promise<ToolOutcome> {
    const target = this.linked.get(id);
    if (!target) return denied();
    const value = { resource_id: id, state: await this.resources.inspect(target.resource), tools: this.describe(id) };
    return { kind: "succeeded", model: value, data: value };
  }

  resolve(id: string, name: string, selector: Json, args: Json): Invocation | ToolOutcome {
    const target = this.linked.get(id);
    if (!target) return denied();
    const tool = target.tools.find(implementation => implementation.tool.name === name);
    if (!tool) return { kind: "rejected", error: { code: "tool_unavailable", message: "This tool is unavailable for the resource. Use resource_inspect to list available tools." } };
    return tool.prepare(target.resource, selector, args);
  }
}
