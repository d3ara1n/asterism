/** core 领域库的声明用例；依赖 SDK，SDK 不依赖本文件。 */
import { z } from "zod";
import { pluginNamespace } from "./draft-2026-10-12-plugin-sdk.ts";

export const core = pluginNamespace("atelier.core");
export const UserMessage = core.record("agent.user-message", {
  version: 1, schema: z.strictObject({ text: z.string() }),
});
export const TextBlock = core.record("agent.text", {
  version: 1, schema: z.strictObject({ text: z.string(), complete: z.boolean() }),
});
export const Submit = core.command("agent.submit", {
  version: 1, input: z.strictObject({ text: z.string(), submissionId: z.string() }), output: z.strictObject({ accepted: z.boolean() }),
});
export const AgentResource = core.resource("agent", {
  version: 1, dataSchema: z.strictObject({}), createSchema: z.strictObject({ configuration: z.string() }),
  records: { UserMessage, TextBlock }, commands: { Submit },
});
