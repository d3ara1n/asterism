import type { FoldedObject } from "../session/fold.ts";
import type { ToolContract } from "@asterism-app/sdk/contracts";
import type { ToolImplementation } from "./contract.ts";

/** Group tool contracts by identity and select implementations by backend; never infer tool identity by comparing target/result. */
export class ToolRegistry {
  private readonly implementations: readonly ToolImplementation[];
  constructor(implementations: readonly ToolImplementation[]) {
    const pairs = new Set<string>();
    const identities = new Set<string>();
    const tools = new Map<string, ToolContract>();
    for (const implementation of implementations) {
      const key = JSON.stringify([implementation.resourceKind, implementation.tool.name]);
      const identity = implementation.reference.id;
      if (pairs.has(key) || identities.has(identity)) throw new Error(`Duplicate tool implementation: ${implementation.tool.name} / ${implementation.resourceKind}`);
      const definition = implementation.tool;
      const existing = tools.get(implementation.tool.name);
      if (existing !== undefined && existing !== definition) throw new Error(`Conflicting tool contract: ${implementation.tool.name}`);
      pairs.add(key); identities.add(identity); tools.set(implementation.tool.name, definition);
    }
    this.implementations = [...implementations];
  }

  match(resource: FoldedObject): readonly ToolImplementation[] {
    return this.implementations.filter(implementation => implementation.resourceKind === resource.kind);
  }
}
