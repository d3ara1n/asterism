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

/** Each plugin's declarations must be unambiguous; resolve cross-plugin overrides after all successful assembly. */
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
  // Local declarations and final catalogs share contract identity, implementation identity, and support relationship validation.
  new ToolRegistry(tools);
}

interface ResourceToolSelection {
  contract: ToolContract;
  plugin: string;
  implementations: Map<string, { implementation: ToolImplementation; plugin: string }>;
}

/** Input contains successfully assembled plugins only, already sorted by user list; independent of initialization order. */
export function resolveToolContributions(entries: readonly ToolContributions[]) {
  const topLevelTools = new Map<string, RegisteredTopLevelTool>();
  const resourceTools = new Map<string, ResourceToolSelection>();
  const seenContracts = new Set<ToolContract>();
  for (const entry of entries) {
    for (const registered of entry.topLevelTools) topLevelTools.set(registered.tool.name, registered);
    for (const implementation of entry.tools) {
      const contract = implementation.tool;
      // Clear same-name support relationships when introducing new contracts; later old-contract references cannot reactivate them.
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
