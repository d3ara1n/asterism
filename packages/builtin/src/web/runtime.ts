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
  const view = () => ({
    connections: plugin.webProviders.list().map(({ settings: _settings, baseUrl: _baseUrl, auth: _auth, ...connection }) => connection),
    types: plugin.webProviders.types().map(({ id, label, search, fetch, urlPatterns }) => ({ id, label, search, fetch, urlPatterns })),
  });
  return {
    webProviders: [exaWebProvider],
    resources: [implementResource(WebResource, WebView, {
      creation: implementCreation(CreateWeb, { create: ({ title }) => ({ title, data: {} }) }),
      project: view, inspect: async () => view(),
      attach(_data, object, lifetime) { objects.set(object.ref.id, object.ref); lifetime.defer(() => { objects.delete(object.ref.id); }); },
    })],
    tools: [
      implementTool(WebSearch, {
        call: (_data, _target, { provider, ...request }, { signal }) => result(async () => {
          const types = plugin.webProviders.types();
          const selected = provider ?? plugin.webProviders.list().find(connection => connection.enabled && types.some(type => type.id === connection.type && type.search))?.id;
          if (!selected) throw new WebError("provider_unavailable", "Configure an enabled search provider in Providers settings.");
          return plugin.web.search(request, { provider: selected, signal });
        }, signal),
        toModel: data => JSON.stringify(data),
      }),
      implementTool(WebFetch, { call: (_data, _target, request, { signal }) => result(() => plugin.web.fetch(request, { signal }), signal),
        toModel: data => JSON.stringify(data) }),
    ],
  };
});
