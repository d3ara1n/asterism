import { z } from "zod";
import { defineModule, defineTopLevelTool } from "@asterism-app/sdk/runtime";
import { ShellProfileListResult, type ShellSettings } from "./contract.ts";
import { listShellProfiles } from "./profiles.ts";

export function createShellModule(settings: () => ShellSettings) {
  return defineModule(() => ({
    topLevelTools: [defineTopLevelTool({
      id: ShellProfileListResult.id,
      name: "shell_profile_list",
      description: "List shared shell profiles, executable availability and the default selection for directory exec and terminal creation.",
      guidelines: [
        "Directory exec uses the default selection. Terminal creation accepts a profile ID or 'auto'; omitting profile uses the default selection.",
        "Automatic selection follows platform preference order, then remaining custom profiles. Availability reports executable discovery at query time.",
      ],
      argsSchema: z.strictObject({}).describe("Empty parameter object."),
      resultSchema: ShellProfileListResult.schema,
      effect: "read", execution: "parallel",
      async execute(_args, { signal }) {
        if (signal.aborted) return { kind: "cancelled", message: "Shell profile listing was cancelled." };
        const data = await listShellProfiles(settings());
        if (signal.aborted) return { kind: "cancelled", message: "Shell profile listing was cancelled." };
        return { kind: "succeeded", data };
      },
    })],
  }));
}
