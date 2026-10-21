import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { defineModule, type PluginContext } from "@atelier/sdk/runtime";
import type { ModelEvent, ModelRunEvent, StreamRequest } from "@atelier/sdk/contracts";
import { Agent, CreateAgent, Execution } from "@atelier/builtin-api/contracts";
import { ApplicationService } from "../../../../../src/runtime/service.ts";
import * as pluginLoader from "../../../../../src/plugins/loader.ts";
import type { ModelAdapter } from "../../../../../src/model/contract.ts";
import { AgentPeek, peekResultSchema, type PeekResult } from "./contract.ts";

// docs/runtime.md：真实内置装配必须通过 resource_call 的授权，工具流及结局由调用方拥有。
it("真实 Agent 资源调用沿用授权、空 target、工具进度与调用方历史", async () => {
  const root = mkdtempSync(join(tmpdir(), "atelier-peek-"));
  const originalLoad = pluginLoader.loadPlugins;
  let plugin!: PluginContext, targetId = "";
  const requests: StreamRequest[] = [];
  const delivered: PeekResult[] = [];
  let releaseReport!: () => void;
  const reportReady = new Promise<void>(resolve => { releaseReport = resolve; });
  vi.spyOn(pluginLoader, "loadPlugins").mockImplementation(([builtin, ...external], host) => originalLoad([
    { ...builtin!, modules: [...builtin!.modules ?? [], defineModule(context => { plugin = context; return {}; })] }, ...external,
  ], { ...host, models: { ...host.models,
    roles: () => [{ id: "utility", name: "Utility", description: "", hidden: true, model: "test/model", thinking: null }],
    list: () => [{ model: "test/model", provider: "test", name: "Test", contextWindow: 65536,
      capabilities: { tools: true, reasoning: false, thinkingLevels: [] } }],
    async *stream(request): AsyncIterable<ModelEvent> {
      requests.push(request);
      if (requests.length === 1) {
        yield { type: "part.start", part: { kind: "toolcall", id: "search", name: "search_records", callId: "search" } };
        yield { type: "part.end", partId: "search", arguments: { query: "Target" } };
        yield { type: "finish", reason: "tool-calls", usage: null, source: { model: "test/model", adapter: "test/1", scope: "test" } };
        return;
      }
      await reportReady;
      yield { type: "part.start", part: { kind: "text", id: "report" } };
      yield { type: "part.delta", partId: "report", delta: "<peek-report>Saved evidence supports the answer.</peek-report>" };
      yield { type: "part.end", partId: "report" };
      yield { type: "finish", reason: "stop", usage: null, source: { model: "test/model", adapter: "test/1", scope: "test" } };
    },
  } }));
  const adapter: ModelAdapter = { version: "test/1", validate() {}, prepare() { return {
    async *stream() {
      yield { type: "part.start", part: { kind: "toolcall", id: "peek", name: "resource_call", callId: "call" } };
      yield { type: "part.end", partId: "peek", arguments: { resource_id: targetId, tool: "peek", args: { question: "What happened?" } } };
      yield { type: "finish", reason: "tool-calls", usage: null };
    },
  }; } };
  let app: ApplicationService | undefined;
  try {
    app = new ApplicationService(root, { adapterFactory: () => adapter, onSessionChanged(event) {
      if (event.kind !== "session.progress") return;
      for (const block of event.progress.live) {
        if (block.kind !== "toolcall") continue;
        const parsed = peekResultSchema.safeParse(block.result?.data);
        if (parsed.success) delivered.push(parsed.data);
      }
    } });
    await app.configuration.execute({ type: "provider.save", id: null, credential: { action: "keep" }, value: {
      id: "test", name: "Test", protocol: "openai-responses", baseUrl: "https://example.invalid", auth: "none", enabled: true, compatibility: [],
    } });
    await app.configuration.execute({ type: "model.save", id: null, value: {
      providerId: "test", modelId: "model", name: "Test", enabled: true, contextWindow: 65536, cost: null, compatibility: [],
      capabilities: { tools: true, reasoning: false, thinkingLevels: [] }, generation: { temperature: null, topP: null, maxOutputTokens: null },
    } });
    const sessionId = app.sessions.tree.create("Peek"), session = plugin.session(sessionId);
    const selection = { agent: "worker", model: "test/model", thinking: null };
    const caller = await session.create(CreateAgent, { selection, title: "Caller" });
    const target = await session.create(CreateAgent, { selection, title: "Target" }); targetId = target.id;
    const actor = plugin.object(sessionId, Agent, caller.id), subject = plugin.object(sessionId, Agent, target.id);
    for (const [object, text] of [[actor, "Caller private evidence"], [subject, "Target saved evidence"]] as const)
      object.commit(writer => { writer.append(Execution, { type: "block", block: {
        kind: "text", text, complete: true, responseId: object.ref.id, requestParentId: null, ordinal: 0, continuation: null,
        source: { model: "test/model", adapter: "test/1", scope: "test" },
      } }); });
    const events: ModelRunEvent[] = [];
    const run = () => plugin.models.run({ object: caller, target: { role: "default", model: "test/model" },
      requestParentId: session.snapshot().position.nodeId, system: { blocks: [] }, messages: [], tools: { allow: ["peek"] },
      signal: new AbortController().signal, observer: { event(event) {
        events.push(structuredClone(event));
        if (event.type !== "progress") actor.commit(writer => { writer.append(Execution, event); });
      } },
    });
    expect((await run()).tools[0]).toMatchObject({ kind: "rejected", error: { code: "access_denied" } });
    expect(requests).toHaveLength(0);
    session.link(caller, target);
    await app.sessions.execute({ type: "watch", sessionId });
    const running = run();
    // 状态必须经过宿主 32ms 合并到达 GUI 通道，不能只检查工具内部 publish 的调用。
    await vi.waitFor(() => expect(delivered.some(data => data.phase === "searching")).toBe(true));
    releaseReport();
    const result = await running;
    expect(result.tools[0]).toMatchObject({
      kind: "succeeded", implementation: { id: AgentPeek.id },
      resource: { id: target.id, title: "Target" },
      data: { report: "Saved evidence supports the answer." },
    });
    expect(requests).toHaveLength(2);
    expect(JSON.stringify(requests[0]!.messages)).toContain("Target saved evidence");
    expect(JSON.stringify(requests[0]!.messages)).not.toContain("Caller private evidence");
    expect(events.some(event => event.type === "progress" && event.blocks.some(block =>
      block.kind === "toolcall" && block.result?.data && JSON.stringify(block.result.data).includes("Saved evidence supports")))).toBe(true);
    const records = session.snapshot().records.query(Execution, { scope: "timeline" });
    expect(records.filter(record => record.record.source?.resource?.id === target.id)).toHaveLength(1);
    expect(records.at(-1)).toMatchObject({ record: { source: { resource: { id: caller.id } } },
      data: { type: "block", block: { kind: "toolcall", outcome: { kind: "succeeded", data: { report: "Saved evidence supports the answer." } } } } });
  } finally {
    releaseReport();
    try { await app?.close(); }
    finally { vi.restoreAllMocks(); rmSync(root, { recursive: true, force: true }); }
  }
});
