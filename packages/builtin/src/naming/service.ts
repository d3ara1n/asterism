import { builtin, AutomaticSessionName, type ModelRole } from "@asterism-app/builtin-api/contracts";
import { present, type ModelTarget, type SessionSnapshot } from "@asterism-app/sdk/contracts";
import { PluginApiError, type ModelServices, type SessionExecutor } from "@asterism-app/sdk/runtime";
import { resolveRoleTarget } from "../configuration/runtime.ts";
import { namingMessages } from "../messages/naming.ts";
import { cleanTitle, collectTurns, namingInstruction, namingPrompt, namingState, userMessages, type AutomaticNamingTrigger } from "./policy.ts";

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

export interface NamingDependencies {
  models: Pick<ModelServices, "stream">;
  roles(): readonly ModelRole[];
  userAgent?: string;
}

/** Both entry points capture material, generate with utility, and append one host title assignment. */
export function createSessionNaming(deps: NamingDependencies) {
  return async (session: SessionExecutor, snapshot: SessionSnapshot, trigger: AutomaticNamingTrigger | null, signal: AbortSignal): Promise<void> => {
    const turns = collectTurns(snapshot.records.all({ scope: "timeline" }));
    if (!turns.length) throw new PluginApiError("unavailable", "The session has no conversation to name.", undefined, namingMessages.noMaterial);
    const roles = deps.roles();
    const model = roles.find(role => role.id === "utility" && role.enabled)?.model ?? null;
    if (model === null) {
      if (trigger) return;
      throw new PluginApiError("unavailable", "The utility model is unavailable.", undefined, namingMessages.utilityUnavailable);
    }
    const target = resolveRoleTarget(roles, "utility");
    const prompt = namingPrompt(trigger?.level === "initial" ? turns.slice(0, 1).map(turn => ({ user: turn.user })) : turns);
    const title = await generateTitle(deps.models, target, prompt, AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]), session.id, deps.userAgent);
    session.commit(() => {
      if (trigger) {
        const current = session.snapshot();
        if (namingState(current).explicit || !userMessages(current, "timeline").some(input => input.record.id === trigger.messageId)) return;
      }
      // A user-requested generation expresses explicit naming intent, even when its text is unchanged.
      session.title.set(title, trigger ? present(AutomaticSessionName, { ...trigger, model }) : undefined);
    });
  };
}
