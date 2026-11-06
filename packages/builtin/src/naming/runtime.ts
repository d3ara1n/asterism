import { z } from "zod";
import { defineModule, defineTopLevelTool, implementCall } from "@asterism-app/sdk/runtime";
import { builtinConfiguration } from "../configuration/runtime.ts";
import { automaticNamingTrigger, namingRules } from "./policy.ts";
import { GenerateSessionName, SessionNameResult, SessionRenameResult } from "./contract.ts";
import { createSessionNaming } from "./service.ts";

/** Builtin naming policy observes Agent input and writes through the host title capability. */
export function createNamingModule(userAgent?: string) {
  return defineModule(plugin => {
    const generate = createSessionNaming({ models: plugin.models, roles: () => builtinConfiguration(plugin).roles, userAgent });
    function nameSession(sessionId: string, input: string) {
      const title = input.replace(/\s+/gu, " ").trim();
      plugin.session(sessionId).title.set(title);
      return { title };
    }

    return {
      calls: [implementCall(GenerateSessionName, async ({ sessionId }, { signal }) => {
        const session = plugin.session(sessionId);
        const snapshot = session.snapshot();
        await generate(session, snapshot, null, signal);
        return {};
      })],
      topLevelTools: [
        defineTopLevelTool({
          id: SessionNameResult.id, name: "session_name",
          description: "Read the current session's title.", guidelines: [],
          argsSchema: z.strictObject({}).describe("Empty parameter object."),
          resultSchema: SessionNameResult.schema,
          effect: "read", execution: "parallel",
          async execute(_args, { session }) {
            return { kind: "succeeded", data: { title: session.title.get() } };
          },
        }),
        defineTopLevelTool({
          id: SessionRenameResult.id, name: "session_rename",
          description: "Set the current session's title to the name you choose.",
          guidelines: [
            "A concise title in the user's language helps identify the work; the conversation and the user's naming preferences guide the choice.",
            ...namingRules,
            "The title is recorded in the timeline as an agent choice and takes precedence over automatic naming. Later user or agent choices can replace it.",
          ],
          argsSchema: z.strictObject({
            title: z.string().min(1).max(160).regex(/\S/u, "The title must contain non-whitespace text.")
              .describe("The chosen session title, up to 160 UTF-16 code units. Whitespace is trimmed and collapsed."),
          }).describe("The title to save for the current session."),
          resultSchema: SessionRenameResult.schema,
          effect: "write", execution: "sequential",
          async execute({ title }, { session }) {
            return { kind: "succeeded", data: nameSession(session.id, title) };
          },
        }),
      ],
      observers: [{
        id: "session-naming",
        committed({ records, snapshot, session }) {
          const trigger = automaticNamingTrigger(snapshot, records);
          if (!trigger) return;
          plugin.tasks.start(`naming:${session.id}:${trigger.messageId}`, signal => generate(session, snapshot, trigger, signal));
        },
      }],
    };
  });
}
