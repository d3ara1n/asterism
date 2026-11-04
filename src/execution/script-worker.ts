import { parentPort, workerData } from "node:worker_threads";
import variant from "@jitl/quickjs-wasmfile-release-sync";
import { newQuickJSWASMModuleFromVariant, type QuickJSDeferredPromise, type QuickJSHandle, type QuickJSSyncVariant } from "quickjs-emscripten-core";
import type { ScriptInput, ScriptReply, ScriptRequest } from "./script-protocol.ts";

const port = parentPort!;
const input = workerData as ScriptInput;
const interrupt = new Int32Array(input.interrupt);
// The variant's NodeNext declaration exposes its CommonJS namespace; its ESM default is the variant.
const QuickJS = await newQuickJSWASMModuleFromVariant(variant as unknown as QuickJSSyncVariant);
/** Heap and native stack bounds for one script runtime. */
const MEMORY_LIMIT_BYTES = 256 * 1024 * 1024;
const STACK_LIMIT_BYTES = 1024 * 1024;
const runtime = QuickJS.newRuntime();
runtime.setMemoryLimit(MEMORY_LIMIT_BYTES);
runtime.setMaxStackSize(STACK_LIMIT_BYTES);
runtime.setInterruptHandler(() => Atomics.load(interrupt, 0) !== 0);
const vm = runtime.newContext();
const pending = new Map<number, QuickJSDeferredPromise>();
let nextId = 0;
let script: QuickJSHandle | undefined;
let wrap: QuickJSHandle | undefined;
let run: QuickJSHandle | undefined;
let closed = false;
const send = (message: ScriptRequest) => port.postMessage(message);

function close() {
  if (closed) return;
  closed = true;
  port.removeAllListeners("message");
  for (const promise of pending.values()) promise.dispose();
  pending.clear();
  if (wrap?.alive) wrap.dispose();
  if (run?.alive) run.dispose();
  script?.dispose();
  vm.dispose();
  runtime.dispose();
  port.close();
}
function fail(error: unknown) {
  send({ type: "error", message: error instanceof Error ? error.message : String(error) });
  close();
}
function errorText(handle: QuickJSHandle): string {
  const error = vm.dump(handle) as unknown;
  return typeof error === "object" && error !== null && "message" in error
    ? String(error.message) : String(error);
}
function pump() {
  try {
    const jobs = runtime.executePendingJobs();
    if (jobs.error) {
      const message = errorText(jobs.error);
      jobs.error.dispose();
      throw new Error(message);
    }
    const state = vm.getPromiseState(script!);
    if (state.type === "fulfilled") {
      const value = JSON.parse(vm.getString(state.value));
      state.value.dispose();
      send({ type: "done", value });
      close();
    } else if (state.type === "rejected") {
      const message = errorText(state.error);
      state.error.dispose();
      throw new Error(message);
    } else if (!pending.size) {
      throw new Error("The script is waiting on a promise with no pending tool call.");
    }
  } catch (error) { fail(error); }
}

try {
  const bridge = vm.newFunction("invoke", (name, args) => {
    const argumentsValue = JSON.parse(vm.getString(args));
    const id = nextId++;
    const promise = vm.newPromise();
    pending.set(id, promise);
    send({ type: "call", id, name: vm.getString(name), args: argumentsValue });
    return promise.handle;
  });
  vm.setProp(vm.global, "__invoke", bridge);
  bridge.dispose();
  const logBridge = vm.newFunction("log", value => {
    send({ type: "log", value: JSON.parse(vm.getString(value)) });
    return vm.undefined;
  });
  vm.setProp(vm.global, "__log", logBridge);
  logBridge.dispose();
  // Capture JSON functions before user code runs. The bridge exchanges only JSON, never host objects.
  const bootstrap = vm.evalCode(`(() => {
    const invoke = globalThis.__invoke;
    delete globalThis.__invoke;
    const log = globalThis.__log;
    delete globalThis.__log;
    const parse = JSON.parse, stringify = JSON.stringify;
    globalThis.log = value => {
      const serialized = stringify(value);
      if (serialized === undefined) throw new TypeError("Log values must be JSON-serializable.");
      log(serialized);
    };
    const call = async (name, args) => parse(await invoke(name, stringify(args)));
    const tools = Object.create(null);
    for (const name of ${JSON.stringify(input.tools)}) {
      tools[name] = (args = {}) => call(name, args);
    }
    globalThis.tools = tools;
    globalThis.resources = {
      get: resource_id => new Proxy(Object.create(null), {
        get: (_target, tool) => {
          // Keep JS promise assimilation and JSON serialization from invoking resource operations.
          if (typeof tool !== "string" || tool === "then" || tool === "toJSON") return undefined;
          return (input = {}) => call("resource_call", { ...input, resource_id, tool });
        },
      }),
    };
    globalThis.text = result => result.model
      .filter(part => part.kind === "text").map(part => part.text).join("\\n");
    return async run => stringify((await run()) ?? null);
  })()`, "resource-script-bootstrap.js");
  wrap = vm.unwrapResult(bootstrap);
  const evaluated = vm.evalCode(`(async () => {\n${input.code}\n})`, "resource-script.js");
  run = vm.unwrapResult(evaluated);
  const result = vm.callFunction(wrap, vm.undefined, run);
  run.dispose();
  wrap.dispose();
  script = vm.unwrapResult(result);
  port.on("message", (reply: ScriptReply) => {
    if (closed) return;
    const promise = pending.get(reply.id);
    if (!promise) return;
    pending.delete(reply.id);
    const value = vm.newString(JSON.stringify(reply.value));
    promise.resolve(value);
    value.dispose();
    promise.dispose();
    pump();
  });
  pump();
} catch (error) { fail(error); }
