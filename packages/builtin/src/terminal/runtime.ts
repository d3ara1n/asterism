import { terminalCard } from "../shared/card-appearance.ts";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { randomUUID } from "node:crypto";
import { defineModule, implementResource, implementCreation, implementTool, implementCall, implementChannel, PluginApiError,
  type CallResult, type ObjectReader } from "@asterism-app/sdk/runtime";
import { ResourceStatusChanged, type Json } from "@asterism-app/sdk/contracts";
import type { ShellSettings } from "../shell/contract.ts";
import { terminalMessages } from "../messages/terminal.ts";
import { SharedTerminal, TerminalError, keySequence, type TerminalViewer } from "./service.ts";
import { TerminalResource, CreateTerminal, TerminalView, TerminalInput, TerminalRead, TerminalWait, TerminalSee, TerminalChannel,
  StartTerminal, CloseTerminal, TerminalImageRequested, CompleteTerminalImage, inactiveStatus, type TerminalConfig, type TerminalDown, type TerminalImage } from "./contract.ts";

/**
 * A terminal resource is a static entry point, with its external shell instance attached to the object lifecycle: it starts automatically only when the resource is newly created;
 * it remains unopened after application restart, rewind, or session restoration. The instance ends with the object lifecycle (removal, leaving the current set, archival, exit).
 */
export function createTerminalModule(settings: () => ShellSettings) { return defineModule(plugin => {
  const terminals = new Map<string, SharedTerminal>();
  /** Resources newly created in this run and awaiting an appearance notification; start automatically when they appear. */
  const pendingStart = new Set<string>();
  const images = new Map<string, { resolve(png: Uint8Array): void; reject(error: Error): void }>();
  const root = join(plugin.dir, "shell-integration");
  const release = (id: string): Promise<void> => {
    pendingStart.delete(id);
    const terminal = terminals.get(id);
    if (!terminal) return Promise.resolve();
    terminals.delete(id);
    return terminal.dispose();
  };
  function terminal(config: TerminalConfig, ref: ObjectReader["ref"]): SharedTerminal {
    const existing = terminals.get(ref.id);
    if (existing) return existing;
    const created = new SharedTerminal(config, settings, root, {
      // The session list marks only startup failures; individual interactive shell commands do not create completion or persistent-running markers.
      failed(error) {
        if (plugin.lifetime.signal.aborted || terminals.get(ref.id) !== created) return;
        plugin.log.warn(`Terminal startup failed: ${error instanceof Error ? error.message : String(error)}`);
        try { plugin.object(ref.sessionId, TerminalResource, ref.id).events.publish(ResourceStatusChanged, ResourceStatusChanged.schema.parse({ status: "failed", title: terminalMessages.terminal })); }
        catch { /* The resource has left the current set. */ }
      },
      log: (message, error) => plugin.log.error(message, error),
    });
    terminals.set(ref.id, created);
    return created;
  }
  function get(object: ObjectReader): SharedTerminal {
    const data = object.snapshot()?.data;
    if (!data) throw new TerminalError("terminal_removed", "The terminal is no longer available.");
    return terminal(TerminalResource.stateSchema.parse(data), object.ref);
  }
  const statusOf = (object: ObjectReader) => terminals.get(object.ref.id)?.status ?? { ...inactiveStatus };
  plugin.lifetime.defer(() => {
    // The object scope releases terminal instances; the host waits for object cleanup before ending the plugin scope.
    for (const image of images.values()) image.reject(new TerminalError("renderer_unavailable", "The terminal image service is closing."));
  });

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
    const lifetime = AbortSignal.any([signal, plugin.lifetime.signal, AbortSignal.timeout(15_000)]);
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
    resources: [implementResource(TerminalResource, TerminalView, {
      card: terminalCard,
      template: { current: [] },
      creation: implementCreation(CreateTerminal, {
        async prepare(input) {
          if (input.cwd && (!isAbsolute(input.cwd) || !(await stat(input.cwd).catch(() => null))?.isDirectory()))
            throw new PluginApiError("invalid_argument", "The working directory must be an existing absolute directory.");
          if (input.profile && input.profile !== "auto" && !settings().profiles.some(profile => profile.id === input.profile))
            throw new PluginApiError("invalid_argument", "The shell profile is not configured.");
          return { action: "accept" };
        },
        create(input, object) {
          pendingStart.add(object.ref.id);
          return { title: input.title ?? "Terminal", data: { cwd: input.cwd ?? homedir(), profile: input.profile ?? settings().selected } };
        },
      }),
      project: config => config,
      inspect: async (config, object) => ({ ...config, ...statusOf(object) }),
      attach(config, object, lifetime) {
        lifetime.defer(() => release(object.ref.id));
        if (!pendingStart.delete(object.ref.id)) return;
        void terminal(config, object.ref).start()
          .catch(error => { if (!lifetime.signal.aborted) plugin.log.warn(`Terminal startup failed: ${String(error)}`); });
      },
      disposalWarning(_config, object) {
        const state = statusOf(object).state;
        return state === "running" ? terminalMessages.runningWarning : state === "unknown" || state === "starting" ? terminalMessages.unknownWarning : null;
      },
    })],
    channels: [implementChannel(TerminalChannel, channel => {
      const shared = get(channel.object);
      const viewer: TerminalViewer = { send: (frame: TerminalDown) => channel.send(frame) };
      const receive = shared.attach(viewer);
      channel.onMessage(receive);
      channel.signal.addEventListener("abort", () => shared.detach(viewer), { once: true });
    })],
    calls: [
      implementCall(StartTerminal, async (_input, { object }) => {
        try { await get(object).start(); }
        catch (error) {
          // The failure is already reflected in terminal state; the caller receives a readable reason.
          throw new PluginApiError("unavailable", error instanceof Error ? error.message : "The shell could not be started.");
        }
        return null;
      }),
      implementCall(CloseTerminal, async (_input, { object }) => { await terminals.get(object.ref.id)?.close(); return null; }),
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
          const shared = get(object);
          const data = (args.text ?? "") + (args.key ? keySequence(args.key, shared.applicationCursor) : "") + (args.enter ? "\r" : "");
          return shared.input(data, signal);
        }),
      }),
      implementTool(TerminalRead, { call: (_data, target, _args, { object, signal }) => outcome(signal, () => get(object).read(target?.source ?? "screen", target?.offset, target?.limit)) }),
      implementTool(TerminalWait, { async call(_data, _target, args, { object, signal }) {
        const result = await outcome(signal, () => get(object).waitIdle(args.timeout, signal));
        if (result.kind !== "succeeded") return result;
        const { reason, ...data } = result.data;
        return reason === "idle" ? { kind: "succeeded", data } : { kind: "failed", data,
          error: { code: `terminal_${reason}`, message: reason === "timeout" ? "The shell did not become idle before the timeout. The terminal continues running." : `The terminal cannot report idle: ${reason}.` } };
      } }),
      implementTool(TerminalSee, {
        call: (_data, _target, _args, { object, signal }) => outcome(signal, async () => {
          const shared = get(object), screen = await shared.image();
          const png = await renderImage(screen, signal);
          return { image: await object.content.stage(png), cols: screen.cols, rows: screen.rows, state: shared.status.state };
        }),
        toModel: data => [{ kind: "text", text: `Terminal screen: ${data.cols}×${data.rows}, ${data.state}.` },
          { kind: "file", file: data.image, mediaType: "image/png", filename: "terminal.png" }],
      }),
    ],
  };
}); }
