/** 作者用例与类型检查；导入 SDK 和可选领域库，不执行这些声明。 */
import { z } from "zod";
import {
  defineModule, definePlugin, observe, prepare, pluginNamespace, implementResource, Session,
  type SessionSnapshot, type SessionRecord, type ResourceWriter, type ResourceContext,
  type CommandServices, type ModelServices, type ResourceRef,
} from "./draft-2026-10-12-plugin-sdk.ts";
import { AgentResource, UserMessage, TextBlock, Submit } from "./draft-2026-10-12-core-contracts.ts";

const filesystem = pluginNamespace("example.filesystem");
const FileRead = filesystem.record("file.read", {
  version: 1, schema: z.strictObject({ path: z.string(), text: z.string() }),
});
const DirectoryResource = filesystem.resource("directory", {
  version: 1, dataSchema: z.strictObject({ path: z.string() }), createSchema: z.strictObject({ path: z.string() }),
  records: { FileRead }, commands: {},
});
const namingNamespace = pluginNamespace("example.naming");
export const namingPlugin = definePlugin({
  namespace: namingNamespace, version: "0.1.0", api: { major: 1, minMinor: 0 },
  modules: [defineModule(() => ({ contributions: [observe({
    id: "name-session", on: Session.Committed,
    async run(event, context) {
      if (!event.records.some(record => UserMessage.decode(record)?.status === "known")) return;
      const first = await event.snapshot.records.first(UserMessage, { scope: "session" });
      if (first?.status !== "known" || !event.records.some(record => record.id === first.id)) return;
      const text: string = first.data.text;
      const expectedVersion = event.snapshot.title.version;
      context.tasks.start({
        key: first.id, timeoutMs: 30_000,
        async run(task) {
          const result = await task.models.generateText({
            target: { role: "utility" },
            system: "Generate a concise session title from the user's first message. Return only the title.",
            input: text, signal: task.signal,
          });
          return task.session.title.propose(result.text, { expectedVersion, cause: first });
        },
      });
    },
  })] }))],
});

export const emptyInputGuard = prepare({
  id: "empty-input", on: Submit,
  run(proposal) {
    return proposal.input.text.trim() ? { action: "accept" } : { action: "reject", code: "empty_input", message: "Enter a message." };
  },
});

// 以下检查针对独立契约：错误类型、错误归属和事实拦截必须在编译期被拒绝。
declare const snapshot: SessionSnapshot;
declare const rawRecord: SessionRecord;
declare const writer: ResourceWriter<typeof AgentResource>;
declare const resourceContext: ResourceContext<typeof AgentResource>;
declare const commands: CommandServices;
declare const agentRef: ResourceRef;
declare const models: ModelServices;
declare const signal: AbortSignal;
const decoded = UserMessage.decode(rawRecord);
if (decoded?.status === "known") {
  const text: string = decoded.data.text;
  void text;
  // @ts-expect-error 用户消息不具备目录文件定位字段。
  decoded.data.path;
  // @ts-expect-error 观察结果不可修改。
  decoded.data.text = "changed";
}
writer.append(UserMessage, { text: "Hello" });
// @ts-expect-error 错误 payload 不能通过从第二个参数反向推导契约绕过校验。
writer.append(UserMessage, { text: 1 });
// @ts-expect-error 其他资源的记录不能由该资源 writer 提交。
writer.append(FileRead, { path: "a.txt", text: "Hello" });
// @ts-expect-error 已发生的事实（记录）不能注册进入前替换或拒绝，prepare 只接受命令。
prepare({ id: "rewrite-output", on: TextBlock, run: () => ({ action: "accept" }) });
// @ts-expect-error 替换必须符合命令输入契约。
prepare({ id: "wrong-replacement", on: Submit, run: () => ({ action: "replace", data: { text: 1, submissionId: "s" } }) });
// @ts-expect-error 同步提交不能传入异步事务回调。
resourceContext.commit(async () => {});
implementResource(AgentResource, { commands: {
  async Submit(input, context) {
    context.commit(writer => { writer.append(UserMessage, { text: input.text }); });
    return { accepted: true };
  },
} });
implementResource(AgentResource, { commands: {
  // @ts-expect-error 命令返回值必须符合 output 契约。
  Submit: async () => ({ accepted: "yes" }),
} });
const sameShape = filesystem.record("user-message", {
  version: 1, schema: z.strictObject({ text: z.string() }),
});
// @ts-expect-error 同形 payload 的不同契约仍不能跨资源提交。
writer.append(sameShape, { text: "Hello" });
// @ts-expect-error 观察入口要求契约值，不接受字符串事件名。
observe({ id: "string-event", on: "session.committed", run() {} });
const committedRef = resourceContext.commit(writer => writer.append(UserMessage, { text: "Hello" }));
const committedId: string = committedRef.id;
void committedId;
async function checkQueries() {
  const first = await snapshot.records.first(UserMessage, { scope: "session" });
  if (first?.status === "known") { const text: string = first.data.text; void text; }
  const directory = await snapshot.resources.get(DirectoryResource, "directory-id");
  if (directory) {
    const path: string = directory.data.path;
    void path;
    // @ts-expect-error 目录公开数据没有模型选择字段。
    directory.data.selection;
  }
}
void checkQueries;
async function checkInvoke() {
  const output = await commands.invoke(Submit, agentRef, { text: "Hello", submissionId: "s1" });
  const accepted: boolean = output.accepted;
  void accepted;
  // @ts-expect-error 命令输入由契约确定。
  await commands.invoke(Submit, agentRef, { text: 1, submissionId: "s1" });
  // @ts-expect-error 不接受字符串地址，跨插件调用必须持有命令契约。
  await commands.invoke("atelier.core/agent.submit", agentRef, { text: "Hello", submissionId: "s1" });
  // @ts-expect-error 记录契约不能混作命令。
  await commands.invoke(UserMessage, agentRef, { text: "Hello" });
}
void checkInvoke;

// 模型服务只消费 SDK 模型协议类型；无需资源或领域配置。
models.stream({ target: { role: "default" }, system: "Answer briefly.", messages: [{ kind: "input", text: "Hello" }], signal });
void models.run({
  signal, maxRequests: 1,
  async environment() { return { target: { role: "default" }, system: "Answer briefly.", messages: [{ kind: "input", text: "Hello" }] }; },
  onEvent(event) { const requestId: string = event.requestId; void requestId; },
});
async function checkRun() {
  const outcome = await models.run({
    signal, maxRequests: 1,
    async environment() {
      return { target: { role: "default" }, system: "s", messages: [], executor: {
        async execute(call) { return { status: "unknown", reason: "interrupted" } as const; },
      } };
    },
    onEvent() {},
  });
  if (outcome.status === "failed") { const code: string = outcome.code; void code; }
}
void checkRun;
