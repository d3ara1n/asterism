import type { StreamRequest, UsageItem } from "@asterism/sdk/contracts";
import type { PluginContext } from "@asterism/sdk/runtime";

/** Example consumer: actively queries before a request and parses response headers against the current catalog for the response's connection. */
export async function* streamWithUsage(plugin: PluginContext, connectionId: string, request: StreamRequest,
  receive: (items: UsageItem[]) => void) {
  const connection = plugin.modelProviders.get(connectionId);
  const usage = connection?.enabled && connection.usage ? plugin.usageProviders.get(connection.usage) : null;
  if (connection && usage && usage.source !== "headers") {
    const credential = await plugin.modelProviders.credential(connection.id, { signal: request.signal });
    const items = await plugin.usages.query(usage.id, { connection: { id: connection.id, endpoint: connection.baseUrl }, credential, signal: request.signal });
    receive(items);
  }
  for await (const event of plugin.models.stream(request)) {
    const response = event.type === "finish" ? event.response : null;
    if (response) {
      const current = plugin.modelProviders.get(response.connection.id);
      const parser = current?.enabled && current.usage ? plugin.usageProviders.get(current.usage) : null;
      if (parser?.source === "headers") {
        try {
          const items = plugin.usages.parseHeaders(parser.id, { connection: { id: response.connection.id, endpoint: response.endpoint },
            model: response.model, status: response.status, receivedAt: response.receivedAt, headers: response.headers });
          if (items !== null) receive(items);
        } catch { plugin.log.warn("Usage response parsing failed."); }
      }
    }
    yield event;
  }
}
