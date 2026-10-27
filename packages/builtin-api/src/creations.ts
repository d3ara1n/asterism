import { z } from "zod";
import { defineCall } from "@asterism/sdk/contracts";
import { builtin } from "./identity.ts";

/** The public association between model-facing creation entry points and resource types; excludes instance titles and execution permissions. */
export const ReadAgentCreations = defineCall(builtin.name("creations.read"), {
  scope: "plugin",
  input: z.strictObject({}),
  output: z.array(z.strictObject({ id: z.string(), resourceKind: z.string() })),
});
