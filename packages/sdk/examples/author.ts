import { sample, Counter, Count, CounterView, CountChanged, CreateCounter, ChangeCount, CounterUpdates, counterCard } from "./counter-contract.ts";
/** SDK author examples and type counterexamples: compile only, without executing plugins, databases, or real model requests. */
import { z } from "zod";
import { pluginNamespace, defineAction, resourceCall, defineRecord, defineTool, defineImplementation, modelRunRecordSchema, type ModelItem } from "@asterism/sdk/contracts";
import {
  defineModule, definePlugin, implementCreation, implementAction, implementPreparer, implementResource, implementTool, implementChannel,
  type PluginContext, type ObjectReader, type ObjectExecutor, type SessionObserver, type SessionSnapshot, type ResourceRef,
} from "@asterism/sdk/runtime";

/** Scenario one: uses only session events and lifecycles, without resources, models, or Agents. */
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
      cursorChanged({ snapshot, session }) {
        const annotation = snapshot.records.last(Annotation, { scope: "timeline" });
        if (annotation?.status !== "known") return;
        session.commit(writer => { writer.set(CurrentSummary, { text: annotation.data.text }); });
      },
    } satisfies SessionObserver],
  }))],
});
export function annotate(plugin: PluginContext, sessionId: string, text: string) {
  plugin.session(sessionId).commit(writer => { writer.append(Annotation, { text }); });
}
/** Locate the latest typed record by scope and contract; leave unknown for domain consumers to handle. */
export function latestAnnotation(plugin: PluginContext, sessionId: string) {
  return plugin.session(sessionId).snapshot().records.last(Annotation, { scope: "session" });
}
const CurrentSummary = journal.data("summary", z.strictObject({ text: z.string() }));
/** Current session data does not enter the timeline; it is stored separately from object data and private plugin databases. */
export function saveSummary(plugin: PluginContext, sessionId: string, text: string) {
  const session = plugin.session(sessionId);
  session.commit(writer => { writer.set(CurrentSummary, { text }); });
  return session.get(CurrentSummary);
}

/** Scenario two: creation, state, events, actions, and tools for an independent resource, without model capabilities. */
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
/** Feature modules receive only their own settings read capability; configuration declarations remain at the assembly site. */
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
        card: counterCard,
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
      // The channel follows the object's lifetime: the host aborts signal when the object is removed or disappears after rewinding.
      channels: [implementChannel(CounterUpdates, channel => {
        channel.onMessage(() => channel.send(currentCount(channel.object)));
        const timer = setInterval(() => channel.send(currentCount(channel.object)), 1000);
        channel.signal.addEventListener("abort", () => clearInterval(timer), { once: true });
      })],
    };
  })],
});

/** Scenario three: the plugin's own Agent drives the loop, with context projected from the timeline each time. */
const research = pluginNamespace("example.research");
const Execution = defineRecord(research.name("execution"), { schema: modelRunRecordSchema });
export const modelRecordsModule = defineModule(() => ({ records: [Execution] }));
/** The domain plugin constructs the projection from its own input/execution events; it is not stored in Agent or run. */
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

/** Counterexample basis: typed events, synchronous commits/observation, explicit model input, and resource input. */
export function rejectInvalidUsage(plugin: PluginContext, object: ObjectExecutor, reader: ObjectReader) {
  // @ts-expect-error The read facade cannot commit.
  reader.commit(() => {});
  // @ts-expect-error A read-only title cannot be written.
  reader.session.title.set("New");
  // @ts-expect-error The lifecycle is not a string-based event bus.
  plugin.on("start", () => {});
  // @ts-expect-error The base object interface does not handle model execution.
  object.run({}, new AbortController().signal);
  // @ts-expect-error The internal session node array is not exposed.
  object.session.nodes();
  // @ts-expect-error Session data must also match the held contract.
  object.session.commit(writer => { writer.set(Count, { value: "wrong" }); });
  // @ts-expect-error The synchronous callback contract does not accept a Promise.
  object.commit(async writer => { writer.set(Count, { value: 1 }); });
  const invalidObserver: SessionObserver = {
    id: "invalid-observer",
    // @ts-expect-error Delegate long-running work to managed tasks instead of returning a Promise from synchronous observers.
    async committed() {},
  };
  void invalidObserver;
  object.commit(writer => {
    // @ts-expect-error State values must match the held contract.
    writer.set(Count, { value: "wrong" });
    // @ts-expect-error Event data must match the held contract.
    writer.append(CountChanged, { value: "wrong" });
  });
  // @ts-expect-error Each call must explicitly provide the target, prompt, projected input, and event consumer.
  plugin.models.run({ object: object.ref, signal: new AbortController().signal });
}

/** External preparers also infer input from the action contract they hold, without redeclaring the schema. */
export const counterLimit = implementPreparer(ChangeCount, {
  id: "clamp-change",
  prepare(input) { return { action: "replace", input: { amount: Math.max(-10, Math.min(10, input.amount)) } }; },
});

/** Invocation and replacement receive raw strings; preparation and execution receive numbers transformed by the schema. */
const FromText = defineAction(Counter, { id: sample.name("from-text"),
  schema: z.string().regex(/^\d+$/u).transform(Number),
});
export const parsedAction = implementAction(FromText, {
  prepare(value) { return value > 10 ? { action: "replace", input: "10" } : { action: "accept" }; },
  async execute(value, object) { object.commit(writer => { writer.set(Count, { value }); }); },
});
export function parsedInputExamples() {
  resourceCall(FromText, "5");
  // @ts-expect-error Callers submit raw input and cannot substitute parsed results.
  resourceCall(FromText, 5);
  implementPreparer(FromText, {
    id: "invalid-replacement",
    // @ts-expect-error replace supplies new input and must match the raw input type.
    prepare(value) { return { action: "replace", input: value }; },
  });
}
