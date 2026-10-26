import { webCard } from "../shared/card-appearance.ts";
import { defineModule, implementResource, implementCreation, implementTool, WebError, type CallResult } from "@asterism/sdk/runtime";
import type { Json, ResourceRef, WebFetchResult, WebSearchResult } from "@asterism/sdk/contracts";
import { WebResource, CreateWeb, WebView, WebSearch, WebFetch } from "./contract.ts";
import { exaWebProvider } from "./exa.ts";
import { parallelWebProvider } from "./parallel.ts";
import { costOf, emptyWebStats, finishRequest, projectStats, startRequest, type WebRequestKind, type WebSessionStats } from "./stats.ts";

async function result<T extends Json>(work: () => Promise<T>, signal: AbortSignal): Promise<CallResult<T>> {
  try { signal.throwIfAborted(); return { kind: "succeeded", data: await work() }; }
  catch (error) {
    if (signal.aborted) return { kind: "cancelled", message: "The web request was cancelled." };
    return { kind: "failed", error: { code: error instanceof WebError ? error.code : "request_failed", message: error instanceof Error ? error.message : String(error) } };
  }
}
export default defineModule(plugin => {
  const objects = new Map<string, ResourceRef>();
  /** 按会话累计的请求统计只在本次运行内存在；回溯不清零，请求与费用已经实际发生。 */
  const sessions = new Map<string, WebSessionStats>();
  const notify = (sessionId?: string) => {
    for (const ref of objects.values()) if (sessionId === undefined || ref.sessionId === sessionId) plugin.object(ref.sessionId, WebResource, ref.id).invalidate();
  };
  plugin.lifetime.defer(plugin.webProviders.subscribe(() => notify()));
  const update = (sessionId: string, change: (stats: WebSessionStats) => WebSessionStats) => {
    sessions.set(sessionId, change(sessions.get(sessionId) ?? emptyWebStats()));
    notify(sessionId);
  };
  /** 记录一次请求的耗时、结果与实报费用；记录不影响工具结果。 */
  async function tracked<T extends WebSearchResult | WebFetchResult>(sessionId: string, kind: WebRequestKind, subject: string,
    work: () => Promise<T>, signal: AbortSignal): Promise<CallResult<T>> {
    const started = performance.now();
    update(sessionId, startRequest);
    const outcome = await result(work, signal);
    update(sessionId, stats => finishRequest(stats, {
      kind, subject, outcome: outcome.kind === "succeeded" ? "succeeded" : outcome.kind === "cancelled" ? "cancelled" : "failed",
      at: Date.now(), durationMs: performance.now() - started, cost: outcome.kind === "succeeded" ? costOf(outcome.data.usage) : [],
    }));
    return outcome;
  }
  const catalog = () => {
    const states = new Map(plugin.webProviders.list().map(s => [s.id, s]));
    return { types: plugin.webProviders.types().map(type => ({ id: type.id, label: type.label, search: type.search, fetch: type.fetch, enabled: states.get(type.id)?.enabled ?? false })) };
  };
  return {
    webProviders: [exaWebProvider, parallelWebProvider],
    resources: [implementResource(WebResource, WebView, {
      card: webCard,
      creation: implementCreation(CreateWeb, { create: ({ title }) => ({ title, data: {} }) }),
      project: (_data, object) => ({
        configured: plugin.webProviders.list().some(state => state.enabled),
        stats: projectStats(sessions.get(object.ref.sessionId) ?? emptyWebStats()),
      }),
      inspect: async () => catalog(),
      attach(_data, object, lifetime) { objects.set(object.ref.id, object.ref); lifetime.defer(() => { objects.delete(object.ref.id); }); },
    })],
    tools: [
      implementTool(WebSearch, {
        call: (_data, _target, request, { object, signal }) =>
          tracked(object.ref.sessionId, "search", request.query, () => plugin.web.search(request, { signal }), signal),
        toModel: data => JSON.stringify(data),
      }),
      implementTool(WebFetch, {
        call: (_data, _target, request, { object, signal }) =>
          tracked(object.ref.sessionId, "fetch", request.url, () => plugin.web.fetch(request, { signal }), signal),
        toModel: data => JSON.stringify(data),
      }),
    ],
  };
});
