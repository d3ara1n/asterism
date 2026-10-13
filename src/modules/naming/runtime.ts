import { defineModule, type ModelServices } from "@atelier/sdk/runtime";
import { inputSummary } from "../../shared/model-input.ts";
import type { SessionSnapshot } from "@atelier/sdk/contracts";
import { coreId, coreNamespace } from "../../shared/core.ts";
import { UserMessage } from "../agent/records.ts";
import { SessionNamed } from "./records.ts";
import { cleanTitle, collectTurns, namingInstruction, namingPrompt, renameCheckpoints } from "./policy.ts";

const timeoutMs = 10_000;
const responseLimit = 4000;

async function generateTitle(models: Pick<ModelServices, "stream">, prompt: string, signal: AbortSignal): Promise<string> {
  let text = "", finished = false;
  const textParts = new Set<string>();
  for await (const event of models.stream({
    target: { role: "utility" }, signal,
    system: { blocks: [{ id: coreId("session-naming"), kind: "system", from: coreNamespace, text: namingInstruction }] },
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

/** 用户消息触发两级自动命名；助手输出只作为材料，命名事件不进入模型对话。 */
export default defineModule(plugin => ({
  records: [SessionNamed],
  observers: [{
    id: "session-naming",
    committed({ records, snapshot, session }) {
      const latest = snapshot.records.last(UserMessage, { scope: "path" });
      if (latest?.status !== "known" || !records.some(record => record.id === latest.record.id)) return;
      const named = snapshot.records.last(SessionNamed, { scope: "session" });
      if (named?.status === "unknown" || named?.data.source === "user" || (named && named.data.title !== snapshot.title)) return;
      const first = snapshot.records.first(UserMessage, { scope: "session" });
      const initial = first?.status === "known" && records.some(record => record.id === first.record.id);
      const message = initial ? first : latest;
      const level = initial ? "initial" : "refined";
      if (level === "refined" && !renameCheckpoints.has(snapshot.records.query(UserMessage, { scope: "path" }).length)) return;
      if (named?.status === "known" && named.data.auto?.messageId === message.record.id) return;
      const model = plugin.models.roles().find(role => role.id === "utility")?.model ?? null;
      if (model === null) return;
      const expected = snapshot.title, nameId = named?.record.id ?? null;
      const prompt = namingPrompt(level === "initial" ? [{ user: inputSummary(message.data.parts) }]
        : collectTurns(snapshot.records.all({ scope: "path" })));
      // 过时判断只读命名事件、标题与最新输入；较新的生效命名或输入使在途结果失效。
      const isCurrent = (view: SessionSnapshot) => view.title === expected &&
        (view.records.last(SessionNamed, { scope: "session" })?.record.id ?? null) === nameId &&
        view.records.last(UserMessage, { scope: "path" })?.record.id === latest.record.id;
      plugin.tasks.start(`naming:${session.id}:${message.record.id}`, async signal => {
        if (!isCurrent(session.snapshot())) return;
        const title = await generateTitle(plugin.models, prompt, signal);
        if (!isCurrent(session.snapshot())) return;
        // 比较更新与命名事件加入同一事务；事件保存实际生效标题，原历史保持不变。
        session.commit(writer => {
          if (session.title.propose(title, { expected })) writer.append(SessionNamed, {
            title: session.title.get(), source: "auto", auto: { level, messageId: message.record.id, model } });
        });
      }, { timeoutMs });
    },
  }],
}));
