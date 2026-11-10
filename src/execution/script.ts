import { Worker } from "node:worker_threads";
import { defaultToolModel, type Json, type ToolOutcome } from "@asterism-app/sdk/contracts";
import type { CallResult } from "../tools/contract.ts";
import { ResourceCall, ResourceScriptResult, type ScriptCall } from "../tools/core.ts";
import type { PendingCall, ToolObserver } from "./core.ts";
import type { ScriptInput, ScriptReply, ScriptRequest } from "./script-protocol.ts";

type ScriptData = { calls: ScriptCall[]; logs: Json[]; value?: Json };
interface ScriptOptions {
  id: string;
  code: string;
  timeout?: number;
  tools: string[];
  signal: AbortSignal;
  publish(data: Json): void;
  execute(call: PendingCall, signal: AbortSignal, observer: ToolObserver): Promise<ToolOutcome>;
}

/** Drops absent fields so summaries hold JSON values and later updates never erase earlier facts. */
function defined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as Partial<T>;
}
/** Resource methods always dispatch through resource_call; the summary names the selected resource tool. */
function resourceTool(call: PendingCall): string | undefined {
  const args = call.arguments;
  return call.name === ResourceCall.name && args && typeof args === "object" && !Array.isArray(args) && typeof args.tool === "string"
    ? args.tool : undefined;
}
/** Identity, timing, and diagnostics of a child outcome; arguments, data, and model output stay out of history. */
function settledSummary(outcome: ToolOutcome): Partial<ScriptCall> {
  return defined({
    kind: outcome.kind, implementation: outcome.implementation, resource: outcome.resource,
    startedAt: outcome.startedAt, finishedAt: outcome.finishedAt,
    error: "error" in outcome ? outcome.error : undefined,
    message: "message" in outcome ? outcome.message : undefined,
  });
}

/** The script owns its VM and outstanding calls; resources operated on retain their own lifetime. */
export async function executeResourceScript(options: ScriptOptions): Promise<CallResult> {
  const calls: ScriptCall[] = [];
  const logs: Json[] = [];
  const controller = new AbortController();
  const signal = AbortSignal.any([options.signal, controller.signal]);
  const interrupt = new SharedArrayBuffer(4);
  const active = new Set<Promise<void>>();
  const snapshot = (): ScriptData => ({ calls: calls.map(call => ({ ...call })), logs: [...logs] });
  const publish = () => options.publish(ResourceScriptResult.schema.parse(snapshot()));
  let stop: (result: CallResult) => void = () => {};
  let finished = false;
  let value: Json | undefined;
  let completion: CallResult;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let worker: Worker | undefined;
  const abort = () => stop({ kind: "cancelled", message: "Script execution was cancelled." });
  publish();
  try {
    completion = await new Promise<CallResult>(resolve => {
      stop = result => {
        if (finished) return;
        finished = true;
        Atomics.store(new Int32Array(interrupt), 0, 1);
        controller.abort();
        resolve(result);
      };
      if (options.signal.aborted) { abort(); return; }
      options.signal.addEventListener("abort", abort, { once: true });
      if (options.timeout !== undefined) timer = setTimeout(() => stop({
        kind: "failed", error: { code: "script_timeout", message: `Script execution exceeded ${options.timeout} s.` },
      }), options.timeout * 1000);
      const input: ScriptInput = { code: options.code, tools: options.tools, interrupt };
      worker = new Worker(new URL(import.meta.url.endsWith(".ts") ? "./script-worker.ts" : "./script-worker.js", import.meta.url), { workerData: input });
      worker.on("error", error => stop({ kind: "failed", error: {
        code: "script_failed", message: error instanceof Error ? error.message : String(error),
      } }));
      worker.on("exit", code => stop({ kind: "failed", error: { code: "script_worker_exit", message: `Script worker exited before returning a result (code ${code}).` } }));
      worker.on("message", (message: ScriptRequest) => {
        if (finished) return;
        if (message.type === "done") {
          value = message.value;
          stop({ kind: "succeeded", data: null });
        } else if (message.type === "error") {
          stop({ kind: "failed", error: { code: "script_failed", message: message.message } });
        } else if (message.type === "log") {
          logs.push(message.value);
          publish();
        } else {
          const call: PendingCall = { callId: `${options.id}/${message.id}`, name: message.name, arguments: message.args };
          const summary: ScriptCall = { id: call.callId, name: call.name, kind: "queued", ...defined({ tool: resourceTool(call) }) };
          calls.push(summary);
          const task = (async () => {
            const outcome = await options.execute(call, signal, {
              prepared(_call, info) { Object.assign(summary, defined(info)); publish(); },
              started(_call, info) { Object.assign(summary, defined(info), { kind: "running" }); publish(); },
            });
            Object.assign(summary, settledSummary(outcome));
            publish();
            if (!finished) worker!.postMessage({ id: message.id, value: outcome } satisfies ScriptReply);
          })().catch(error => {
            const diagnostic = { code: "script_dispatch_failed", message: error instanceof Error ? error.message : String(error) };
            if (summary.kind === "queued" || summary.kind === "running")
              Object.assign(summary, { kind: "failed", error: diagnostic, finishedAt: Date.now() });
            stop({ kind: "failed", error: diagnostic });
          });
          active.add(task);
          void task.finally(() => active.delete(task));
        }
      });
    });
  } catch (error) {
    completion = { kind: "failed", error: { code: "script_failed", message: error instanceof Error ? error.message : String(error) } };
  } finally {
    clearTimeout(timer);
    options.signal.removeEventListener("abort", abort);
    Atomics.store(new Int32Array(interrupt), 0, 1);
    controller.abort();
    await worker?.terminate();
    await Promise.all(active);
  }
  return { ...completion, data: { ...snapshot(), ...(value === undefined ? {} : { value }) } };
}

/** Explicit logs precede the return value; child call summaries remain in history. */
export function scriptToModel(data: Json): string {
  const result = ResourceScriptResult.schema.parse(data);
  const value = result.value === undefined ? "" : defaultToolModel(result.value);
  if (!result.logs.length) return value;
  return `Logs:\n${result.logs.map(defaultToolModel).join("\n")}${result.value === undefined ? "" : `\n\nReturn value:\n${value}`}`;
}
