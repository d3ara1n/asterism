import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineModule, type PluginContext, type SessionExecutor, type SessionWriter, type ModelServices } from "@asterism/sdk/runtime";
import { AgentInputMessage, SessionNamed } from "@asterism/builtin-api/contracts";
import type { SessionSnapshot } from "@asterism/sdk/contracts";
import { ApplicationService } from "../../../../src/runtime/service.ts";
import * as pluginLoader from "../../../../src/plugins/loader.ts";
import { sessionSnapshot } from "../../../../src/plugins/records.ts";
import { nodeView } from "../../../../src/session/view.ts";
import { event, message, node } from "../../../../src/session/test-nodes.ts";
import { createNamingModule } from "./runtime.ts";

const roots: string[] = [], services: ApplicationService[] = [];
const loadPlugins = pluginLoader.loadPlugins;
afterEach(async () => {
  for (const service of services.splice(0)) await service.close();
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function checkpoint(source?: "user" | "agent", afterInput = false) {
  const nodes = Array.from({ length: 4 }, (_, index) =>
    node(`input-${index}`, index ? `input-${index - 1}` : null, message("agent", `用户消息 ${index}`)));
  const named = () => node("named", nodes.at(-1)!.id, event(SessionNamed.id, { title: "明确选择", source: source! }));
  if (source && !afterInput) nodes.push(named());
  nodes.push(node("input-4", nodes.at(-1)!.id, message("agent", "第五条用户消息")));
  if (source && afterInput) nodes.push(named());
  return sessionSnapshot(nodeView("s", "当前标题", nodes, nodes.at(-1)!.id));
}

function namingObserver() {
  const append = vi.fn(() => "appended");
  const snapshot = vi.fn<() => SessionSnapshot>();
  const session = { id: "s", snapshot,
    commit(work: (writer: SessionWriter) => undefined) { work({ append, set: vi.fn() }); },
  } as unknown as SessionExecutor;
  const start = vi.fn<PluginContext["tasks"]["start"]>(() => true);
  const roles = vi.fn(() => [{ id: "utility", model: "test/model" }]);
  const stream = vi.fn<ModelServices["stream"]>();
  const module = createNamingModule(() => () => {}).setup({
    lifetime: { defer() {} }, tasks: { start }, models: { roles, stream },
  } as unknown as PluginContext);
  const committed = (view: SessionSnapshot) => module.observers![0]!.committed!({
    snapshot: view, session, records: [view.records.last(AgentInputMessage, { scope: "timeline" })!.record],
  });
  return { append, snapshot, start, roles, stream, committed };
}

describe("显式命名优先于自动命名", () => {
  // 第五条用户消息命中自动检查点，但用户或 Agent 的明确选择应在模型解析和任务启动前阻止更新。
  it.each(["user", "agent"] as const)("%s 命名阻止检查点任务，无显式命名的路径仍可自动命名", source => {
    const naming = namingObserver();
    naming.committed(checkpoint(source));
    expect(naming.roles).not.toHaveBeenCalled();
    expect(naming.start).not.toHaveBeenCalled();
    naming.committed(checkpoint());
    expect(naming.start).toHaveBeenCalledOnce();
  });

  // 自动生成与对话工具独立进行；生成期间落入当前路径的显式命名必须阻止已启动任务写回。
  it.each(["user", "agent"] as const)("%s 命名阻止在途自动结果落盘", async source => {
    const naming = namingObserver();
    naming.snapshot.mockReturnValue(checkpoint());
    naming.stream.mockImplementation(async function* () {
      yield { type: "part.start", part: { kind: "text", id: "title" } };
      yield { type: "part.delta", partId: "title", delta: "自动标题" };
      naming.snapshot.mockReturnValue(checkpoint(source, true));
      yield { type: "finish", reason: "stop", usage: null, continuation: null };
    });
    naming.committed(checkpoint());
    await naming.start.mock.calls[0]![1](new AbortController().signal);
    expect(naming.append).not.toHaveBeenCalled();
  });
});

describe("人工命名入口", () => {

  // 插件装配契约：命名 setup 成功后其余模块失败，也不能泄漏可调用的半初始化接口。
  it("builtin 后续模块装配失败时拒绝人工命名，不覆盖标题或追加记录", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(pluginLoader, "loadPlugins").mockImplementation(([builtin, ...external], host) => loadPlugins([
      { ...builtin!, modules: [...builtin!.modules ?? [], defineModule(() => { throw new Error("Setup failed."); })] },
      ...external,
    ], host));
    const root = mkdtempSync(join(tmpdir(), "asterism-naming-failed-")); roots.push(root);
    const service = new ApplicationService(root); services.push(service);
    const sessionId = service.sessions.tree.create("Unchanged");
    await expect(service.sessions.execute({ type: "rename", sessionId, title: "Rejected" })).rejects.toMatchObject({ code: "unavailable" });
    expect(service.sessions.tree.title(sessionId)).toBe("Unchanged");
    expect(service.sessions.tree.nodes(sessionId)).toEqual([]);
  });
});

