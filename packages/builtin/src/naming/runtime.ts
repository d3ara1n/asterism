import { defineModule, type ModelServices } from "@atelier/sdk/runtime";
import { inputSummary, builtin, UserMessage, SessionNamed, type NamingApi } from "@atelier/builtin-api/contracts";
import type { SessionSnapshot } from "@atelier/sdk/contracts";
import { cleanTitle, collectTurns, namingInstruction, namingPrompt, renameCheckpoints } from "./policy.ts";

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
    const disconnect = connect({
      nameByUser(sessionId, title) {
        plugin.session(sessionId).commit(writer => {
          writer.append(SessionNamed, { title: title.replace(/\s+/gu, " ").trim(), source: "user" });
        });
      },
    });
    return {
      records: [SessionNamed],
      observers: [{
        id: "session-naming",
        committed({ records, snapshot, session }) {
          const latest = snapshot.records.last(UserMessage, { scope: "timeline" });
          if (latest?.status !== "known" || !records.some(record => record.id === latest.record.id)) return;
          const named = snapshot.records.last(SessionNamed, { scope: "timeline" });
          if (named?.status === "unknown" || named?.data.source === "user") return;
          const first = snapshot.records.first(UserMessage, { scope: "session" });
          const initial = first?.status === "known" && records.some(record => record.id === first.record.id);
          const message = initial ? first : latest;
          const level = initial ? "initial" : "refined";
          if (level === "refined" && !renameCheckpoints.has(snapshot.records.query(UserMessage, { scope: "timeline" }).length)) return;
          if (named?.status === "known" && named.data.auto?.messageId === message.record.id) return;
          const model = plugin.models.roles().find(role => role.id === "utility")?.model ?? null;
          if (model === null) return;
          const nameId = named?.record.id ?? null;
          const prompt = namingPrompt(level === "initial" ? [{ user: inputSummary(message.data.parts) }]
            : collectTurns(snapshot.records.all({ scope: "timeline" })));
          // 命名依据只来自当前路径，标题同步与观察者顺序不参与过时判断。
          const isCurrent = (view: SessionSnapshot) =>
            (view.records.last(SessionNamed, { scope: "timeline" })?.record.id ?? null) === nameId &&
            view.records.last(UserMessage, { scope: "timeline" })?.record.id === latest.record.id;
          plugin.tasks.start(`naming:${session.id}:${message.record.id}`, async signal => {
            if (!isCurrent(session.snapshot())) return;
            const title = await generateTitle(plugin.models, prompt, signal, session.id, userAgent);
            // 检查与追加在同一同步提交中完成；标题由游标观察者独立同步。
            session.commit(writer => {
              if (isCurrent(session.snapshot())) writer.append(SessionNamed, {
                title, source: "auto", auto: { level, messageId: message.record.id, model } });
            });
          }, { timeoutMs });
        },
        cursorChanged({ snapshot, session }) {
          // 标题 = 当前时间线最后一次命名，否则为当前时间线首条输入的截断；两者都没有时保持不变。
          const named = snapshot.records.last(SessionNamed, { scope: "timeline" });
          if (named?.status === "unknown") return;
          const first = named ? null : snapshot.records.first(UserMessage, { scope: "timeline" });
          const title = named?.data.title ?? (first?.status === "known" ? inputSummary(first.data.parts).slice(0, 72) : null);
          if (title !== null) session.title.set(title);
        },
      }],
      async closing() { disconnect(); },
    };
  });
}
