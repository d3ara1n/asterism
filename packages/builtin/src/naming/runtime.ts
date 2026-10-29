import { z } from "zod";
import { defineModule, defineTopLevelTool, type ModelServices } from "@asterism-app/sdk/runtime";
import { inputSummary, builtin, AutomaticSessionName } from "@asterism-app/builtin-api/contracts";
import { SessionTitleAssigned, present, type SessionSnapshot, type ModelTarget } from "@asterism-app/sdk/contracts";
import { builtinConfiguration, resolveRoleTarget } from "../configuration/runtime.ts";
import { cleanTitle, collectTurns, namingInstruction, namingPrompt, userMessages } from "./policy.ts";
import { SessionNameResult, SessionRenameResult } from "./contract.ts";

const timeoutMs = 10_000;
const responseLimit = 4000;

async function generateTitle(models: Pick<ModelServices, "stream">, target: ModelTarget, prompt: string, signal: AbortSignal, sessionId: string, userAgent?: string): Promise<string> {
  let text = "", finished = false;
  const textParts = new Set<string>();
  for await (const event of models.stream({
    target, signal,
    userAgent, sessionId,
    system: { blocks: [{ id: builtin.name("session-naming"), text: namingInstruction }] },
    messages: [{ kind: "input", parts: [{ kind: "text", text: prompt }] }],
  })) {
    signal.throwIfAborted();
    if (event.type === "part.start" && event.part.kind === "text") textParts.add(event.part.id);
    if (event.type === "part.delta" && textParts.has(event.partId)) {
      text += event.delta;
      if (text.length > responseLimit) throw new Error("The naming response exceeded its output limit.");
    }
    if (event.type === "finish") {
      if (event.reason !== "stop") throw new Error(`The naming response did not finish normally (${event.reason}).`);
      finished = true;
    }
  }
  signal.throwIfAborted();
  const title = cleanTitle(text);
  if (!finished || !title) throw new Error("The naming response did not contain a complete title.");
  return title;
}

/** Builtin naming policy observes Agent input and writes through the host title capability. */
export function createNamingModule(userAgent?: string) {
  return defineModule(plugin => {
    function nameSession(sessionId: string, input: string) {
      const title = input.replace(/\s+/gu, " ").trim();
      plugin.session(sessionId).title.set(title);
      return { title };
    }
    function naming(snapshot: SessionSnapshot) {
      const record = snapshot.records.last(SessionTitleAssigned, { scope: "timeline" });
      if (!record) return { explicit: false, automatic: null };
      const detail = record.status === "known" ? record.data.detail : undefined;
      const automatic = detail?.contract.id === AutomaticSessionName.id
        ? AutomaticSessionName.schema.safeParse(detail.data) : null;
      return { explicit: !automatic?.success, automatic: automatic?.success ? automatic.data : null };
    }
    return {
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
          const inputs = userMessages(snapshot, "timeline");
          const latest = inputs.at(-1);
          if (latest?.status !== "known" || !records.some(record => record.id === latest.record.id)) return;
          const named = naming(snapshot);
          if (named.explicit) return;
          const first = userMessages(snapshot, "session")[0];
          const initial = first?.status === "known" && records.some(record => record.id === first.record.id);
          const message = initial ? first : latest;
          const level = initial ? "initial" : "refined";
          if (level === "refined" && inputs.length !== 5 && inputs.length % 10 !== 0) return;
          if (named.automatic?.messageId === message.record.id) return;
          const roles = builtinConfiguration(plugin).roles;
          const model = roles.find(role => role.id === "utility" && role.enabled)?.model ?? null;
          if (model === null) return;
          const target = resolveRoleTarget(roles, "utility");
          const prompt = namingPrompt(level === "initial" ? [{ user: inputSummary(message.data.parts) }]
            : collectTurns(snapshot.records.all({ scope: "timeline" })));
          const applicable = (view: SessionSnapshot) => {
            return !naming(view).explicit &&
              userMessages(view, "timeline").some(input => input.record.id === message.record.id);
          };
          plugin.tasks.start(`naming:${session.id}:${message.record.id}`, async signal => {
            const title = await generateTitle(plugin.models, target, prompt, signal, session.id, userAgent);
            session.commit(() => {
              if (applicable(session.snapshot())) session.title.set(title,
                present(AutomaticSessionName, { level, messageId: message.record.id, model }));
            });
          }, { timeoutMs });
        },
      }],
    };
  });
}
