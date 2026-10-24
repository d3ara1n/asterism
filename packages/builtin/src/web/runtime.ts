import { defineModule, implementResource, implementCreation, implementTool, WebError, type CallResult } from "@atelier/sdk/runtime";
import type { Json, ResourceRef } from "@atelier/sdk/contracts";
import { WebResource, CreateWeb, WebView, WebSearch, WebFetch } from "./contract.ts";
import { exaWebProvider } from "./exa.ts";

async function result<T extends Json>(work: () => Promise<T>, signal: AbortSignal): Promise<CallResult<T>> {
  try { signal.throwIfAborted(); return { kind: "succeeded", data: await work() }; }
  catch (error) {
    if (signal.aborted) return { kind: "cancelled", message: "The web request was cancelled." };
    return { kind: "failed", error: { code: error instanceof WebError ? error.code : "request_failed", message: error instanceof Error ? error.message : String(error) } };
  }
}
export default defineModule(plugin => {
  const objects = new Map<string, ResourceRef>();
  plugin.lifetime.defer(plugin.webProviders.subscribe(() => {
    for (const ref of objects.values()) plugin.object(ref.sessionId, WebResource, ref.id).invalidate();
  }));
  const view = () => {
    const types = plugin.webProviders.types();
    const states = new Map(plugin.webProviders.list().map(s => [s.id, s]));
    return { types: types.map(type => ({ id: type.id, label: type.label, search: type.search, fetch: type.fetch, enabled: states.get(type.id)?.enabled ?? false })) };
  };
  return {
    webProviders: [exaWebProvider],
    resources: [implementResource(WebResource, WebView, {
      creation: implementCreation(CreateWeb, { create: ({ title }) => ({ title, data: {} }) }),
      project: view, inspect: async () => view(),
      attach(_data, object, lifetime) { objects.set(object.ref.id, object.ref); lifetime.defer(() => { objects.delete(object.ref.id); }); },
    })],
    tools: [
      implementTool(WebSearch, {
        call: (_data, _target, request, { signal }) => result(() => plugin.web.search(request, { signal }), signal),
        toModel: data => JSON.stringify(data),
      }),
      implementTool(WebFetch, {
        call: (_data, _target, request, { signal }) => result(() => plugin.web.fetch(request, { signal }), signal),
        toModel: data => JSON.stringify(data),
      }),
    ],
  };
});
