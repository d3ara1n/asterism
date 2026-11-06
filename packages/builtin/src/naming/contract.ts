import { z } from "zod";
import { defineCall } from "@asterism-app/sdk/contracts";
import { builtin } from "@asterism-app/builtin-api/contracts";

const titleResultSchema = z.strictObject({
  title: z.string().describe("The session title."),
}).describe("The session title at the time of this operation.");

export const SessionNameResult = builtin.data("session.name", titleResultSchema);
export const SessionRenameResult = builtin.data("session.rename", titleResultSchema);

/** Generate a name for a session without running an Agent. */
export const GenerateSessionName = defineCall(builtin.name("session.generate-name"), {
  scope: "plugin", input: z.strictObject({ sessionId: z.string().min(1) }), output: z.strictObject({}),
});
