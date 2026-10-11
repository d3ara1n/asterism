/** SDK 作者用例与类型反例：只编译，不执行插件、数据库或真实模型请求。 */
import { z } from "zod";
import { pluginNamespace, defineRecord, defineTool, defineImplementation, modelRunRecordSchema, type ModelItem } from "@atelier/sdk/contracts";
import {
  defineModule, definePlugin, implementResource, implementTool,
  type PluginContext, type ObjectContext, type SessionObserver, type SessionSnapshot, type ResourceRef,
} from "@atelier/sdk/runtime";

/** 场景一：只使用会话事件与生命周期，不需要资源、模型或 Agent。 */
const journal = pluginNamespace("example.journal");
const Annotation = defineRecord(journal.name("annotation"), {
  version: 1, schema: z.strictObject({ text: z.string() }),
});
export const journalPlugin = definePlugin({
  namespace: journal, version: "0.0.1", modules: [defineModule(plugin => ({
    records: [Annotation],
    observers: [{
      id: "observe-annotations",
      committed({ records }) {
        for (const record of records) {
          const entry = Annotation.decode(record);
          if (entry?.status === "known") plugin.log.info("Annotation committed.");
        }
      },
    } satisfies SessionObserver],
  }))],
});
export function annotate(plugin: PluginContext, sessionId: string, text: string) {
  plugin.session(sessionId).commit(writer => { writer.append(Annotation, { text }); });
}

/** 场景二：独立资源的创建、状态、事件、动作与工具，不使用模型能力。 */
const sample = pluginNamespace("example.counter");
const Counter = sample.resource("counter", z.strictObject({}));
const Count = sample.data("count", 1, z.strictObject({ value: z.number().int() }));
const CounterView = sample.data("card", 1, Count.schema);
const CountChanged = defineRecord(sample.name("count-changed"), {
  version: 1, schema: Count.schema,
});
const createInput = z.strictObject({ title: z.string() });
const actionInput = z.strictObject({ amount: z.number().int() });
const Read = defineTool({
  name: "read_counter", description: "Read the current counter value.", guidelines: [],
  argsSchema: z.strictObject({}).describe("No arguments are required."),
});
const CounterRead = defineImplementation({
  ...sample.data("read", 1, Count.schema.describe("The current integer value.")),
  resource: Counter, tool: Read,
  targetSchema: z.null().describe("Pass null to select this counter."),
  effect: "read", execution: "parallel",
});
function currentCount(object: ObjectContext) {
  const value = object.get(Count);
  if (value === null) throw new Error("Counter state is unavailable.");
  return value;
}
export const counterPlugin = definePlugin({
  namespace: sample, version: "0.0.1", modules: [defineModule(() => ({
    resources: [implementResource(Counter, CounterView, {
      records: [CountChanged],
      creation: {
        schema: createInput,
        create(input, object) {
          object.commit(writer => { writer.set(Count, { value: 0 }); });
          return { title: input.title, data: {} };
        },
      },
      actions: {
        schema: actionInput,
        prepare(input) {
          return Math.abs(input.amount) > 10
            ? { action: "reject", code: "change_too_large", message: "Change exceeds the limit." }
            : { action: "accept" };
        },
        async execute(input, object) {
          object.commit(writer => {
            const value = currentCount(object).value + input.amount;
            writer.set(Count, { value });
            writer.append(CountChanged, { value });
          });
        },
      },
      project(_data, object) { return currentCount(object); },
      async inspect(_data, object) { return currentCount(object); },
    })],
    tools: [implementTool(CounterRead, {
      async call(_data, _target, _args, context) {
        context.signal.throwIfAborted();
        return { kind: "succeeded", data: currentCount(context.object) };
      },
    })],
  }))],
});

/** 场景三：插件自己的 Agent 推动循环，context 每次从时间轴投影。 */
const research = pluginNamespace("example.research");
const Execution = defineRecord(research.name("execution"), { version: 1, schema: modelRunRecordSchema });
export const modelRecordsModule = defineModule(() => ({ records: [Execution] }));
/** 由领域插件根据自己的输入／执行事件构造投影，不保存在 Agent 或 run 中。 */
declare function projectOwnContext(snapshot: SessionSnapshot, object: ResourceRef): ModelItem[];
export async function modelWork(plugin: PluginContext, object: ObjectContext, signal: AbortSignal) {
  for (let request = 0; request < 8; request++) {
    const snapshot = object.session.snapshot();
    const result = await plugin.models.run({
      object: object.ref, requestParentId: snapshot.position.nodeId, target: { role: "default" },
      system: { blocks: [{ id: research.name("instruction"), kind: "system", from: research.id, text: "Inspect linked materials and report findings." }] },
      messages: projectOwnContext(snapshot, object.ref), cache: { expectHit: request > 0 }, signal,
      observer: { event(event) {
        if (event.type === "progress") return;
        object.commit(writer => { writer.append(Execution, modelRunRecordSchema.parse(event)); });
      } },
    });
    if (result.reason !== "completed" || result.tools.length === 0) return result;
  }
  throw new Error("The model request limit was reached.");
}

/** 反例依据：具型事件、同步提交／观察、显式模型输入与资源输入。 */
export function rejectInvalidUsage(plugin: PluginContext, object: ObjectContext) {
  // @ts-expect-error 生命周期不是字符串事件总线。
  plugin.on("start", () => {});
  // @ts-expect-error 基础对象接口不承担模型执行。
  object.run({}, new AbortController().signal);
  // @ts-expect-error 不公开内部会话节点数组。
  object.session.nodes();
  // @ts-expect-error 会话提交不能修改对象状态。
  object.session.commit(writer => { writer.set(Count, { value: 1 }); });
  // @ts-expect-error 同步回调契约不接受 Promise。
  object.commit(async writer => { writer.set(Count, { value: 1 }); });
  const invalidObserver: SessionObserver = {
    id: "invalid-observer",
    // @ts-expect-error 长工作交托管任务，不在同步观察者中返回 Promise。
    async committed() {},
  };
  void invalidObserver;
  object.commit(writer => {
    // @ts-expect-error 状态值须匹配持有的契约。
    writer.set(Count, { value: "wrong" });
    // @ts-expect-error 事件数据须匹配持有的契约。
    writer.append(CountChanged, { value: "wrong" });
  });
  // @ts-expect-error 每次调用必须显式提供目标、提示、投影输入和事件消费者。
  plugin.models.run({ object: object.ref, signal: new AbortController().signal });
}
