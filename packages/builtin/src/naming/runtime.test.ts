import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineModule, type PluginContext, type SessionExecutor, type SessionWriter, type ModelServices } from "@asterism-app/sdk/runtime";
import { AgentInputMessage } from "@asterism-app/builtin-api/contracts";
import { SessionTitleAssigned, type SessionSnapshot } from "@asterism-app/sdk/contracts";
import { BuiltinApplicationService as ApplicationService } from "../testing.ts";
import * as pluginLoader from "../../../../src/plugins/loader.ts";
import { sessionSnapshot } from "../../../../src/plugins/records.ts";
import { nodeView } from "../../../../src/session/view.ts";
import { event, message, node } from "../../../../src/session/test-nodes.ts";
import { createNamingModule } from "./runtime.ts";
import { defaultParadigmConfiguration } from "../configuration/state.ts";

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
  const named = () => node("named", nodes.at(-1)!.id, event(SessionTitleAssigned.id, { title: "明确选择" }, { source: source === "agent" ? { plugin: "asterism.builtin", resource: null } : null }));
  if (source && !afterInput) nodes.push(named());
  nodes.push(node("input-4", nodes.at(-1)!.id, message("agent", "第五条用户消息")));
  if (source && afterInput) nodes.push(named());
  return sessionSnapshot(nodeView("s", "当前标题", nodes, nodes.at(-1)!.id));
}

function namingObserver() {
  const append = vi.fn(() => "appended");
  const snapshot = vi.fn<() => SessionSnapshot>();
  const session = { id: "s", snapshot, title: { set: append },
    commit(work: (writer: SessionWriter) => undefined) { work({ append, begin: vi.fn(() => "pending"), complete: vi.fn(), set: vi.fn() }); },
  } as unknown as SessionExecutor;
  const start = vi.fn<PluginContext["tasks"]["start"]>(() => true);
  const paradigm = structuredClone(defaultParadigmConfiguration);
  paradigm.roles.find(role => role.id === "utility")!.overrides.model = "test/model";
  const roles = vi.fn(() => ({ get: () => ({ paradigm }) }));
  const stream = vi.fn<ModelServices["stream"]>();
  const module = createNamingModule().setup({
    lifetime: { defer() {} }, tasks: { start }, models: { stream }, config: roles,
  } as unknown as PluginContext);
  const committed = (view: SessionSnapshot) => module.observers![0]!.committed!({
    snapshot: view, session, records: [view.records.last(AgentInputMessage, { scope: "timeline" })!.record],
  });
  return { append, snapshot, start, roles, stream, committed };
}

describe("explicit naming takes precedence over automatic naming", () => {
  // The fifth user message reaches an automatic checkpoint, but an explicit user or Agent choice should prevent updates before model resolution and task startup.
  it.each(["user", "agent"] as const)("%s naming blocks checkpoint tasks while paths without explicit naming still allow automatic naming", source => {
    const naming = namingObserver();
    naming.committed(checkpoint(source));
    expect(naming.roles).not.toHaveBeenCalled();
    expect(naming.start).not.toHaveBeenCalled();
    naming.committed(checkpoint());
    expect(naming.start).toHaveBeenCalledOnce();
  });

  // Automatic generation runs independently of conversation tools; explicit naming added to the current path during generation must prevent the running task from writing back.
  it.each(["user", "agent"] as const)("%s naming prevents in-flight automatic results from being persisted", async source => {
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

describe("manual naming entry point", () => {

  // Host titles remain available when a paradigm fails to load.
  it("records manual titles even when a plugin fails assembly", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(pluginLoader, "loadPlugins").mockImplementation(([builtin, ...external], host) => loadPlugins([
      { ...builtin!, modules: [...builtin!.modules ?? [], defineModule(() => { throw new Error("Setup failed."); })] },
      ...external,
    ], host));
    const root = mkdtempSync(join(tmpdir(), "asterism-naming-failed-")); roots.push(root);
    const service = new ApplicationService(root); services.push(service);
    const sessionId = service.sessions.tree.create("Unchanged");
    await expect(service.sessions.execute({ type: "rename", sessionId, title: "Chosen" })).resolves.toBeDefined();
    expect(service.sessions.tree.title(sessionId)).toBe("Chosen");
    expect(service.sessions.tree.nodes(sessionId)).toMatchObject([{ contract: SessionTitleAssigned.id, data: { title: "Chosen" }, source: null }]);
  });
});

