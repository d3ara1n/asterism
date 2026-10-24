import { z } from "zod";
import { defineModule, defineTopLevelTool, type ModelServices } from "@atelier/sdk/runtime";
import { inputSummary, builtin, SessionNamed, type NamingApi } from "@atelier/builtin-api/contracts";
import type { SessionSnapshot } from "@atelier/sdk/contracts";
import { cleanTitle, collectTurns, namingInstruction, namingPrompt, renameCheckpoints, userMessages } from "./policy.ts";
import { SessionNameResult, SessionRenameResult } from "./contract.ts";

const timeoutMs = 10_000;
const responseLimit = 4000;

async function generateTitle(models: Pick<ModelServices, "stream">, prompt: string, signal: AbortSignal, sessionId: string, userAgent?: string): Promise<string> {
  let text = "", finished = false;
  const textParts = new Set<string>();
  for await (const event of models.stream({
    target: { role: "utility" }, signal,
    userAgent, sessionId,
    system: { blocks: [{ id: builtin.name("session-naming"), kind: "system", from: builtin.id, text: namingInstruction }] },
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

/** 在实际插件 setup 中交付具身份的接口；连接的清理由模块生命周期负责。 */
export function createNamingModule(connect: (api: NamingApi) => () => void, userAgent?: string) {
  return defineModule(plugin => {
    function nameSession(sessionId: string, input: string, source: "user" | "agent") {
      const title = input.replace(/\s+/gu, " ").trim();
      plugin.session(sessionId).commit(writer => {
        writer.append(SessionNamed, { title, source });
      });
      return { title };
    }
    const disconnect = connect({
      nameByUser(sessionId, title) {
        nameSession(sessionId, title, "user");
      },
    });
    plugin.lifetime.defer(disconnect);
    return {
      records: [SessionNamed],
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
            return { kind: "succeeded", data: nameSession(session.id, title, "agent") };
          },
        }),
      ],
      observers: [{
        id: "session-naming",
        committed({ records, snapshot, session }) {
          const inputs = userMessages(snapshot, "timeline");
          const latest = inputs.at(-1);
          if (latest?.status !== "known" || !records.some(record => record.id === latest.record.id)) return;
          const named = snapshot.records.last(SessionNamed, { scope: "timeline" });
          if (named && (named.status === "unknown" || named.data.source !== "auto")) return;
          const first = userMessages(snapshot, "session")[0];
          const initial = first?.status === "known" && records.some(record => record.id === first.record.id);
          const message = initial ? first : latest;
          const level = initial ? "initial" : "refined";
          if (level === "refined" && !renameCheckpoints.has(inputs.length)) return;
          if (named?.data.auto?.messageId === message.record.id) return;
          const model = plugin.models.roles().find(role => role.id === "utility")?.model ?? null;
          if (model === null) return;
          const prompt = namingPrompt(level === "initial" ? [{ user: inputSummary(message.data.parts) }]
            : collectTurns(snapshot.records.all({ scope: "timeline" })));
          const applicable = (view: SessionSnapshot) => {
            const named = view.records.last(SessionNamed, { scope: "timeline" });
            return (!named || (named.status === "known" && named.data.source === "auto")) &&
              userMessages(view, "timeline").some(input => input.record.id === message.record.id);
          };
          plugin.tasks.start(`naming:${session.id}:${message.record.id}`, async signal => {
            const title = await generateTitle(plugin.models, prompt, signal, session.id, userAgent);
            // 检查与追加在同一同步提交中完成；标题由游标观察者独立同步。
            session.commit(writer => {
              if (applicable(session.snapshot())) writer.append(SessionNamed, {
                title, source: "auto", auto: { level, messageId: message.record.id, model } });
            });
          }, { timeoutMs });
        },
        cursorChanged({ snapshot, session }) {
          // 标题 = 当前时间线最后一次命名，否则为当前时间线首条输入的截断；两者都没有时保持不变。
          const named = snapshot.records.last(SessionNamed, { scope: "timeline" });
          if (named?.status === "unknown") return;
          const first = named ? null : userMessages(snapshot, "timeline")[0];
          const title = named?.data.title ?? (first?.status === "known" ? inputSummary(first.data.parts).slice(0, 72) : null);
          if (title !== null) session.title.set(title);
        },
      }],
    };
  });
}
