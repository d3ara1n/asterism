import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { randomUUID } from "node:crypto";
import { defineModule, implementResource, implementCreation, implementTool, implementCall, implementChannel, PluginApiError,
  type CallResult, type ObjectReader } from "@atelier/sdk/runtime";
import { ResourceStatusChanged, type Json } from "@atelier/sdk/contracts";
import type { ShellSettings } from "../shell/contract.ts";
import { terminalMessages } from "../messages/terminal.ts";
import { SharedTerminal, TerminalError, keySequence, type TerminalViewer } from "./service.ts";
import { TerminalResource, CreateTerminal, TerminalView, TerminalInput, TerminalRead, TerminalWait, TerminalSee, TerminalChannel,
  StartTerminal, CloseTerminal, TerminalImageRequested, CompleteTerminalImage, inactiveStatus, type TerminalConfig, type TerminalDown, type TerminalImage } from "./contract.ts";

/**
 * 终端资源是静态入口，外部 shell 实例挂在对象生命周期上：只有新建资源时自动开启；
 * 软件重启、回溯与会话恢复后保持未开启。对象生命周期结束（移除、离开当前集合、归档、退出）时结束实例。
 */
export function createTerminalModule(settings: () => ShellSettings) { return defineModule(plugin => {
  const terminals = new Map<string, SharedTerminal>();
  /** 本次运行中新建、尚待出现通知的资源；出现时自动开启。 */
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
      // 会话列表只标记启动失败；交互 shell 的每条命令不构成完成或常驻运行标记。
      failed(error) {
        if (plugin.lifetime.signal.aborted || terminals.get(ref.id) !== created) return;
        plugin.log.warn(`Terminal startup failed: ${error instanceof Error ? error.message : String(error)}`);
        try { plugin.object(ref.sessionId, TerminalResource, ref.id).events.publish(ResourceStatusChanged, ResourceStatusChanged.schema.parse({ status: "failed", title: terminalMessages.terminal })); }
        catch { /* 资源已离开当前集合。 */ }
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
    // 终端实例由对象作用域释放；宿主先等待对象清理，再结束插件作用域。
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
          // 失败已反映在终端状态中；调用方取得可读原因。
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
