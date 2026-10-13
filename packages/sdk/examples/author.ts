import { sample, Counter, Count, CounterView, CountChanged, CreateCounter, ChangeCount } from "./counter-contract.ts";
/** SDK 作者用例与类型反例：只编译，不执行插件、数据库或真实模型请求。 */
import { z } from "zod";
import { pluginNamespace, defineAction, resourceCall, defineRecord, defineTool, defineImplementation, modelRunRecordSchema, type ModelItem } from "@atelier/sdk/contracts";
import {
  defineModule, definePlugin, implementCreation, implementAction, implementPreparer, implementResource, implementTool,
  type PluginContext, type ObjectReader, type ObjectExecutor, type SessionObserver, type SessionSnapshot, type ResourceRef,
} from "@atelier/sdk/runtime";

/** 场景一：只使用会话事件与生命周期，不需要资源、模型或 Agent。 */
const journal = pluginNamespace("example.journal");
const Annotation = defineRecord(journal.name("annotation"), {
  schema: z.strictObject({ text: z.string() }),
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
/** 最新具型记录按契约索引定位；unknown 保留给领域消费者处理。 */
export function latestAnnotation(plugin: PluginContext, sessionId: string) {
  return plugin.session(sessionId).snapshot().records.last(Annotation, { scope: "session" });
}
const CurrentSummary = journal.data("summary", z.strictObject({ text: z.string() }));
/** 当前会话数据不进入时间轴；与对象数据及插件私有数据库分别保存。 */
export function saveSummary(plugin: PluginContext, sessionId: string, text: string) {
  const session = plugin.session(sessionId);
  session.commit(writer => { writer.set(CurrentSummary, { text }); });
  return session.get(CurrentSummary);
}

/** 场景二：独立资源的创建、状态、事件、动作与工具，不使用模型能力。 */
const counterSettings = z.strictObject({
  maxChange: z.number().int().min(1).max(100).meta({
    title: "Maximum change", description: "Largest absolute increment accepted by a counter action.",
  }),
}).meta({ title: "Counter settings" });
const CounterConfig = sample.config(counterSettings, { maxChange: 10 });
const Read = defineTool({
  id: "example.counter/read_counter", name: "read_counter", description: "Read the current counter value.", guidelines: [],
  argsSchema: z.strictObject({}).describe("No arguments are required."),
});
const CounterRead = defineImplementation({
  ...sample.data("read", Count.schema.describe("The current integer value.")),
  resource: Counter, tool: Read,
  targetSchema: z.null().describe("Pass null to select this counter."),
  effect: "read", execution: "parallel",
});
function currentCount(object: ObjectReader) {
  const value = object.get(Count);
  if (value === null) throw new Error("Counter state is unavailable.");
  return value;
}
/** 功能模块只取得自己的设置读取能力；配置声明留在装配位置。 */
function counterChange(limit: () => number) {
  return implementAction(ChangeCount, {
    prepare(input) {
      return Math.abs(input.amount) > limit()
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
  });
}
export const counterPlugin = definePlugin({
  namespace: sample, version: "0.0.1", modules: [defineModule(plugin => {
    const settings = plugin.config(CounterConfig);
    return {
      resources: [implementResource(Counter, CounterView, {
        records: [CountChanged],
        creation: implementCreation(CreateCounter, {
          create(input, object) {
            object.commit(writer => { writer.set(Count, { value: 0 }); });
            return { title: input.title, data: {} };
          },
        }),
        actions: [counterChange(() => settings.get().maxChange)],
        project(_data, object) { return currentCount(object); },
        async inspect(_data, object) { return currentCount(object); },
      })],
      tools: [implementTool(CounterRead, {
        async call(_data, _target, _args, context) {
          context.signal.throwIfAborted();
          return { kind: "succeeded", data: currentCount(context.object) };
        },
      })],
    };
  })],
});

/** 场景三：插件自己的 Agent 推动循环，context 每次从时间轴投影。 */
const research = pluginNamespace("example.research");
const Execution = defineRecord(research.name("execution"), { schema: modelRunRecordSchema });
export const modelRecordsModule = defineModule(() => ({ records: [Execution] }));
/** 由领域插件根据自己的输入／执行事件构造投影，不保存在 Agent 或 run 中。 */
declare function projectOwnContext(snapshot: SessionSnapshot, object: ResourceRef): ModelItem[];
export async function modelWork(plugin: PluginContext, object: ObjectExecutor, signal: AbortSignal) {
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
export function rejectInvalidUsage(plugin: PluginContext, object: ObjectExecutor, reader: ObjectReader) {
  // @ts-expect-error 读取门面不能提交。
  reader.commit(() => {});
  // @ts-expect-error 只读标题不能比较更新。
  reader.session.title.propose("New", { expected: "Old" });
  // @ts-expect-error 生命周期不是字符串事件总线。
  plugin.on("start", () => {});
  // @ts-expect-error 基础对象接口不承担模型执行。
  object.run({}, new AbortController().signal);
  // @ts-expect-error 不公开内部会话节点数组。
  object.session.nodes();
  // @ts-expect-error 会话数据也必须匹配持有的契约。
  object.session.commit(writer => { writer.set(Count, { value: "wrong" }); });
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

/** 外部准备者同样由所持动作契约推导输入，不重复声明 schema。 */
export const counterLimit = implementPreparer(ChangeCount, {
  id: "clamp-change",
  prepare(input) { return { action: "replace", input: { amount: Math.max(-10, Math.min(10, input.amount)) } }; },
});

/** 调用与替换接收原始字符串，准备和执行接收 schema 转换后的数字。 */
const FromText = defineAction(Counter, { id: sample.name("from-text"),
  schema: z.string().regex(/^\d+$/u).transform(Number),
});
export const parsedAction = implementAction(FromText, {
  prepare(value) { return value > 10 ? { action: "replace", input: "10" } : { action: "accept" }; },
  async execute(value, object) { object.commit(writer => { writer.set(Count, { value }); }); },
});
export function parsedInputExamples() {
  resourceCall(FromText, "5");
  // @ts-expect-error 调用方提交原始输入，不能用解析结果代替。
  resourceCall(FromText, 5);
  implementPreparer(FromText, {
    id: "invalid-replacement",
    // @ts-expect-error replace 是新输入，必须符合原始输入类型。
    prepare(value) { return { action: "replace", input: value }; },
  });
}
