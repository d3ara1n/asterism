import type { AgentConfiguration } from "@asterism-app/builtin-api/contracts";

export const legacyAgentPreset = "worker";

/** Stable baseline for custom and saved worker configurations; not a factory-created entry. */
export const legacyWorker: AgentConfiguration = {
  "id": legacyAgentPreset,
  "delegates": null,
  "resources": null,
  "excludeResources": null,
  "builtin": true,
  "enabled": true,
  "availableToAgents": true,
  "description": "General-purpose agent for tasks across domains.",
  "systemPrompt": "General-purpose agent. Carry out the requested task using the available context and capabilities.",
  "modelRole": "default",
  "examples": [
    "Rename all snake_case fields to camelCase",
    "Add input validation to POST /login"
  ],
  "subagent": {
    "instructions": [
      "Work autonomously on the delegated task using its supplied context.",
      "Return the result with relevant supporting details and any unresolved gaps.",
    ].join("\n"),
    "budget": { "maxRequests": 4096, "maxDurationSeconds": 2400 }
  }
};
