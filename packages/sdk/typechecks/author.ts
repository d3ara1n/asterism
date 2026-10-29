import { sample, Counter, Count, CounterView, CountChanged, CreateCounter, ChangeCount, CounterUpdates, counterCard } from "../examples/counter-contract.ts";
/** SDK author examples and type counterexamples: compile only, without executing plugins, databases, or real model requests. */
import { z } from "zod";
import { pluginNamespace, defineAction, resourceCall, defineRecord, defineTool, defineImplementation, modelRunRecordSchema, type ModelItem } from "@asterism-app/sdk/contracts";
import {
  defineModule, definePlugin, implementCreation, implementAction, implementPreparer, implementResource, implementTool, implementChannel,
  type PluginContext, type ObjectReader, type ObjectExecutor, type SessionObserver, type SessionSnapshot, type ResourceRef,
} from "@asterism-app/sdk/runtime";

import { FromText } from "../examples/author.ts";

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
  plugin.models.run({ signal: new AbortController().signal });
}

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
