import type { AgentCatalog } from "@asterism-app/sdk/runtime";
import type { RunGroup } from "../lifecycle.ts";

/** Expose copied catalog values and scoped skill reads without applying a paradigm's selection policy. */
export function bindAgentCatalog(catalog: AgentCatalog, sessionRuns: RunGroup, checkAvailable: () => void): AgentCatalog {
  const outside = { affectsHistory: false } as const;
  return {
    skills() { checkAvailable(); return structuredClone(catalog.skills()); },
    instructions() { checkAvailable(); return structuredClone(catalog.instructions()); },
    refresh(signal) { checkAvailable(); return structuredClone(catalog.refresh(signal)); },
    read(skill, path, signal) {
      checkAvailable();
      return sessionRuns.start(scope => catalog.read(skill, path, scope), { ...outside, signal }).done;
    },
  };
}
