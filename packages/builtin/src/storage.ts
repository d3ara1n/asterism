import { defineStorage } from "@asterism-app/sdk/runtime";
import { jsonSchema } from "@asterism-app/sdk/contracts";
import { z } from "zod";

const settingsV2 = z.object({
  paradigm: z.object({
    agents: z.array(z.object({ overrides: z.record(z.string(), jsonSchema) }).catchall(jsonSchema)),
  }).catchall(jsonSchema).optional(),
}).catchall(jsonSchema);

/** Storage entry point for the built-in plugin, with the same shape as an external plugin's manifest `asterism.storage`; imports no business runtime. */
export default defineStorage([
  { kind: "json", path: ".asterism/config.json", version: 3, migrations: {
    2(data) {
      const settings = settingsV2.parse(data);
      for (const agent of settings.paradigm?.agents ?? []) {
        const { tools: _tools, excludeTools: _exclude, subagentRoles: _delegates, fallbackRole: _fallback, ...overrides } = agent.overrides;
        agent.overrides = overrides;
      }
      return settings;
    },
  } },
  { kind: "sqlite", path: ".asterism/db.sqlite", version: 1, migrations: {} },
]);
