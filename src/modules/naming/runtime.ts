import { defineModule } from "@atelier/sdk/runtime";
import { coreId, coreNamespace } from "../../shared/core.ts";
import { UserMessage } from "../agent/records.ts";

/** 会话命名：会话第一条用户消息提交后，由 utility 角色异步生成标题；失败保留原标题。 */
const instruction = "Generate a concise title (at most 8 words) for a conversation that starts with the user's message below. Reply with the title only, without quotes or punctuation at the end.";

export default defineModule(plugin => ({
  observers: [{
    id: "session-naming",
    committed({ records, snapshot, session }) {
      // 只认全会话最早的用户消息，且它属于本批次；其他代理输入与分支不重新命名。
      const first = snapshot.records.first(UserMessage, { scope: "session" });
      if (first?.status !== "known" || !records.some(record => record.id === first.record.id)) return;
      const message = first.data;
      const expected = snapshot.title;
      plugin.tasks.start(`naming:${session.id}`, async signal => {
        let text = "";
        for await (const event of plugin.models.stream({ target: { role: "utility" }, signal,
          system: { blocks: [{ id: coreId("session-naming"), kind: "system", from: coreNamespace, text: instruction }] },
          messages: [{ kind: "input", text: message.text.slice(0, 4000) }] })) {
          if (event.type === "part.delta") text += event.delta;
        }
        const title = text.trim().replace(/^["'“”]+|["'“”。.]+$/gu, "").trim();
        if (title && !signal.aborted) session.title.propose(title, { expected });
      }, { timeoutMs: 30_000 });
    },
  }],
}));
