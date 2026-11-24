import { z } from "zod";
import { defineModule, defineTopLevelTool } from "@asterism-app/sdk/runtime";
import { ShellProfileListResult } from "./contract.ts";

export function createShellModule() {
  return defineModule(plugin => ({
    topLevelTools: [defineTopLevelTool({
      id: ShellProfileListResult.id,
      name: "shell_list_profile",
      description: "Report the host platform, configured shell profiles, executable availability, and the current shared shell selection.",
      guidelines: [
        "The result distinguishes the configured selection (a profile ID or 'auto') from the resolved profile, if any. Availability reflects executable discovery at query time.",
      ],
      argsSchema: z.strictObject({}).describe("Empty parameter object."),
      resultSchema: ShellProfileListResult.schema,
      effect: "read", execution: "parallel",
      async execute(_args, { signal }) {
        if (signal.aborted) return { kind: "cancelled", message: "Shell profile listing was cancelled." };
        const data = await plugin.shell.profiles.list();
        if (signal.aborted) return { kind: "cancelled", message: "Shell profile listing was cancelled." };
        return { kind: "succeeded", data };
      },
    })],
  }));
}
