import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { randomUUID } from "node:crypto";
import { defineModule, implementResource, implementCreation, implementTool, implementCall, PluginApiError, type CallResult, type ObjectReader } from "@atelier/sdk/runtime";
import { ResourceStatusChanged, type Json } from "@atelier/sdk/contracts";
import type { ShellSettings } from "../shell/contract.ts";
import { terminalMessages } from "../messages/terminal.ts";
import { TerminalSession, TerminalError, keySequence } from "./service.ts";
import { TerminalResource, CreateTerminal, TerminalView, TerminalInput, TerminalRead, TerminalWait, TerminalSee,
  ReadTerminal, StartTerminal, WriteTerminal, ResizeTerminal, TerminalImageRequested, CompleteTerminalImage, type TerminalConfig, type TerminalImage } from "./contract.ts";

export function createTerminalModule(settings: () => ShellSettings) { return defineModule(plugin => {
  const entries = new Map<string, { terminal: TerminalSession; alive: boolean }>();
  const cleanups = new Set<Promise<void>>();
  const images = new Map<string, { resolve(png: Uint8Array): void; reject(error: Error): void }>();
  const encoder = new TextEncoder();
  const release = (id: string) => {
    const entry = entries.get(id);
    if (!entry) return;
    entries.delete(id); entry.alive = false;
    const cleanup = entry.terminal.dispose().catch(error => plugin.log.error("Terminal cleanup failed.", error));
    cleanups.add(cleanup); void cleanup.finally(() => cleanups.delete(cleanup));
  };
  const close = async () => {
    for (const id of entries.keys()) release(id);
    for (const image of images.values()) image.reject(new TerminalError("renderer_unavailable", "The terminal image service is closing."));
    await Promise.all([...cleanups]);
  };
  plugin.signal.addEventListener("abort", () => { void close(); }, { once: true });
  function add(config: TerminalConfig, object: ObjectReader) {
    const ref = object.ref;
    const existing = entries.get(ref.id);
    if (existing) return existing.terminal;
    const executor = plugin.object(ref.sessionId, TerminalResource, ref.id);
    const entry = { terminal: undefined as unknown as TerminalSession, alive: true };
    entry.terminal = new TerminalSession(config, settings, join(plugin.dir, "terminal"), () => {
      if (!entry.alive || plugin.signal.aborted) return;
      executor.invalidate();
      const state = entry.terminal.status.state;
      if (["idle", "running", "failed", "exited"].includes(state)) executor.events.publish(ResourceStatusChanged, ResourceStatusChanged.schema.parse({
        status: state === "running" ? "running" : state === "failed" ? "failed" : "completed", title: terminalMessages.terminal }));
    }, frame => {
      if (entry.alive && !plugin.signal.aborted) executor.streams.publish("terminal", encoder.encode(JSON.stringify(frame)));
    });
    entries.set(ref.id, entry);
    return entry.terminal;
  }
  function get(object: ObjectReader) {
    const data = object.snapshot()?.data;
    if (!data) throw new TerminalError("terminal_removed", "The terminal is no longer available.");
    return entries.get(object.ref.id)?.terminal ?? add(TerminalResource.stateSchema.parse(data), object);
  }
  const statusOf = (object: ObjectReader) => entries.get(object.ref.id)?.terminal.status
    ?? { state: "inactive" as const, shell: null, integration: false, exitCode: null, error: null };
  async function outcome<T extends Json>(signal: AbortSignal, work: () => Promise<T>): Promise<CallResult<T>> {
    try { signal.throwIfAborted(); return { kind: "succeeded", data: await work() }; }
    catch (error) {
      if (signal.aborted) return { kind: "cancelled", message: "The terminal operation was cancelled. The shell continues running." };
      if (error instanceof TerminalError) return { kind: "failed", error: { code: error.code, message: error.message } };
      throw error;
    }
  }
  async function renderImage(screen: TerminalImage, signal: AbortSignal): Promise<Uint8Array> {
    signal.throwIfAborted();
    const id = randomUUID();
    const lifetime = AbortSignal.any([signal, plugin.signal, AbortSignal.timeout(15_000)]);
    let abort!: () => void;
    try {
      return await new Promise<Uint8Array>((resolve, reject) => {
        images.set(id, { resolve, reject });
        abort = () => reject(new TerminalError("image_cancelled", "Terminal image capture was cancelled or the renderer did not respond."));
        lifetime.addEventListener("abort", abort, { once: true });
        plugin.ipc.events.publish(TerminalImageRequested, { id, screen });
      });
    } finally { images.delete(id); lifetime.removeEventListener("abort", abort); }
  }
  return {
    events: [TerminalImageRequested],
    observers: [{ id: "terminal.presence", resourcesChanged({ appeared, disappeared, initial }) {
      for (const resource of disappeared) if (resource.ref.kind === TerminalResource.kind) release(resource.ref.id);
      for (const resource of appeared) if (resource.ref.kind === TerminalResource.kind) {
        const object = plugin.object(resource.ref.sessionId, TerminalResource, resource.ref.id);
        const terminal = add(TerminalResource.stateSchema.parse(resource.data), object);
        if (!initial) void terminal.start().catch(error => { if (!plugin.signal.aborted) plugin.log.error("Terminal startup failed.", error); });
      }
    } }],
    resources: [implementResource(TerminalResource, TerminalView, {
      creation: implementCreation(CreateTerminal, {
        async prepare(input) {
          if (input.cwd && (!isAbsolute(input.cwd) || !(await stat(input.cwd).catch(() => null))?.isDirectory()))
            throw new PluginApiError("invalid_argument", "The working directory must be an existing absolute directory.");
          if (input.profile && input.profile !== "auto" && !settings().profiles.some(profile => profile.id === input.profile))
            throw new PluginApiError("invalid_argument", "The shell profile is not configured.");
          return { action: "accept" };
        },
        create(input) { return { title: input.title ?? "Terminal", data: { cwd: input.cwd ?? homedir(), profile: input.profile ?? settings().selected } }; },
      }),
      project: (config, object) => ({ ...config, ...statusOf(object) }),
      inspect: async (config, object) => ({ ...config, ...statusOf(object) }),
      disposalWarning(_config, object) {
        const state = statusOf(object).state;
        return state === "running" ? terminalMessages.runningWarning : state === "unknown" || state === "starting" ? terminalMessages.unknownWarning : null;
      },
    })],
    calls: [
      implementCall(ReadTerminal, (_input, { object }) => get(object).snapshot()),
      implementCall(StartTerminal, async (_input, { object }) => { await get(object).start(); return null; }),
      implementCall(WriteTerminal, async ({ data }, { object, signal }) => { await get(object).input(data, signal); return null; }),
      implementCall(ResizeTerminal, async ({ cols, rows }, { object }) => { await get(object).resize(cols, rows); return null; }),
      implementCall(CompleteTerminalImage, async ({ id, png, error }) => {
        const pending = images.get(id);
        if (pending) {
          if (png) pending.resolve(Buffer.from(png, "base64"));
          else pending.reject(new TerminalError("image_failed", error ?? "Terminal image rendering failed."));
        }
        return null;
      }),
    ],
    tools: [
      implementTool(TerminalInput, {
        call: (_data, _target, args, { object, signal }) => outcome(signal, async () => {
          const terminal = get(object);
          const data = (args.text ?? "") + (args.key ? keySequence(args.key, terminal.applicationCursor) : "") + (args.enter ? "\r" : "");
          await terminal.input(data, signal);
          return terminal.status;
        }),
      }),
      implementTool(TerminalRead, { call: (_data, _target, args, { object, signal }) => outcome(signal, () => get(object).read(args.mode, args.offset, args.limit)) }),
      implementTool(TerminalWait, { async call(_data, _target, args, { object, signal }) {
        const result = await outcome(signal, () => get(object).waitIdle(args.timeout, signal));
        if (result.kind !== "succeeded") return result;
        const { reason, ...data } = result.data;
        return reason === "idle" ? { kind: "succeeded", data } : { kind: "failed", data,
          error: { code: `terminal_${reason}`, message: reason === "timeout" ? "The shell did not become idle before the timeout. The terminal continues running." : `The terminal cannot report idle: ${reason}.` } };
      } }),
      implementTool(TerminalSee, {
        call: (_data, _target, _args, { object, signal }) => outcome(signal, async () => {
          const terminal = get(object), screen = await terminal.image();
          const png = await renderImage(screen, signal);
          return { image: await object.content.stage(png), cols: screen.cols, rows: screen.rows, state: terminal.status.state };
        }),
        toModel: data => [{ kind: "text", text: `Terminal screen: ${data.cols}×${data.rows}, ${data.state}.` },
          { kind: "file", file: data.image, mediaType: "image/png", filename: "terminal.png" }],
      }),
    ],
    closing: close,
  };
}); }
