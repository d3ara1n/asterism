import { belongsTo, type ToolContract } from "@asterism/sdk/contracts";
import { coreDeclarations } from "../execution/core.ts";
import type { ToolImplementation } from "../tools/contract.ts";
import { ToolRegistry } from "../tools/registry.ts";
import type { RegisteredTopLevelTool } from "./top-level-tools.ts";

interface ToolContributions {
  id: string;
  tools: readonly ToolImplementation[];
  topLevelTools: readonly RegisteredTopLevelTool[];
}

export interface ToolImplementationStatus {
  id: string;
  tool: string;
  resource: string;
  active: boolean;
  overriddenBy?: string;
}

/** 单个插件的声明必须无歧义；跨插件覆盖在全部装配成功后解析。 */
export function validateToolContributions({ id, tools, topLevelTools }: ToolContributions): void {
  const names = new Set(coreDeclarations().map(tool => tool.name));
  const identities = new Set<string>();
  for (const { tool } of topLevelTools) {
    if (!belongsTo(id, tool.id)) throw new Error(`Top-level tool ${tool.id} belongs to another plugin.`);
    if (names.has(tool.name) || identities.has(tool.id)) throw new Error(`Duplicate top-level tool: ${tool.name}`);
    names.add(tool.name);
    identities.add(tool.id);
  }
  for (const tool of tools) {
    if (!belongsTo(id, tool.reference.id)) throw new Error(`Implementation ${tool.reference.id} is outside plugin namespace ${id}.`);
  }
  // 局部声明与最终目录使用同一套契约身份、实现身份及支持关系校验。
  new ToolRegistry(tools);
}

interface ResourceToolSelection {
  contract: ToolContract;
  plugin: string;
  implementations: Map<string, { implementation: ToolImplementation; plugin: string }>;
}

/** 输入仅含成功装配的插件，且已按用户列表排序；不依赖初始化顺序。 */
export function resolveToolContributions(entries: readonly ToolContributions[]) {
  const topLevelTools = new Map<string, RegisteredTopLevelTool>();
  const resourceTools = new Map<string, ResourceToolSelection>();
  const seenContracts = new Set<ToolContract>();
  for (const entry of entries) {
    for (const registered of entry.topLevelTools) topLevelTools.set(registered.tool.name, registered);
    for (const implementation of entry.tools) {
      const contract = implementation.tool;
      // 引入新契约时清空同名支持关系；后续引用旧契约不能重新激活它。
      if (!seenContracts.has(contract)) {
        seenContracts.add(contract);
        resourceTools.set(contract.name, { contract, plugin: entry.id, implementations: new Map() });
      }
      const selection = resourceTools.get(contract.name)!;
      if (selection.contract === contract) {
        selection.implementations.set(implementation.resourceKind, { implementation, plugin: entry.id });
      }
    }
  }

  const tools: ToolImplementation[] = [];
  const implementations = new Map<string, ToolImplementationStatus[]>();
  for (const entry of entries) {
    implementations.set(entry.id, entry.tools.map(implementation => {
      const selection = resourceTools.get(implementation.tool.name)!;
      const winner = selection.implementations.get(implementation.resourceKind);
      const active = winner?.implementation === implementation;
      if (active) tools.push(implementation);
      const overriddenBy = selection.contract === implementation.tool ? winner!.plugin : selection.plugin;
      return { ...implementation.reference, tool: implementation.tool.name, resource: implementation.resourceKind, active,
        ...(active ? {} : { overriddenBy }) };
    }));
  }
  return { topLevelTools: [...topLevelTools.values()], tools, implementations };
}
