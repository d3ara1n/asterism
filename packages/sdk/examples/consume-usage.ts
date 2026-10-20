import type { StreamRequest, UsageItem } from "@atelier/sdk/contracts";
import type { PluginContext } from "@atelier/sdk/runtime";

/** 示例消费者：一次请求前主动查询，或解析该请求的响应头；不建立全局状态。 */
export async function* streamWithUsage(plugin: PluginContext, connectionId: string, request: StreamRequest,
  receive: (items: UsageItem[]) => void) {
  const connection = plugin.providers.get(connectionId);
  const usage = connection?.enabled && connection.usage ? plugin.usages.get(connection.usage) : null;
  let current = true;
  const changed = () => { current = false; };
  const release = [plugin.providers.subscribe(changed), plugin.usages.subscribe(changed)];
  try {
    if (connection && usage && usage.source !== "headers") {
      const credential = await plugin.providers.credential(connection, { signal: request.signal });
      const items = await usage.query({ connection: { id: connection.id, endpoint: connection.baseUrl }, credential, signal: request.signal });
      if (current) receive(items);
    }
    for await (const event of plugin.models.stream(request)) {
      const response = event.type === "finish" ? event.response : null;
      if (current && connection && usage?.source === "headers" && response &&
        response.connection.id === connection.id && response.connection.revision === connection.revision) {
        try {
          const items = usage.parseHeaders({ connection: { id: connection.id, endpoint: response.endpoint },
            model: response.model, status: response.status, receivedAt: response.receivedAt, headers: response.headers });
          if (items !== null) receive(items);
        } catch { plugin.log.warn("Usage response parsing failed."); }
      }
      yield event;
    }
  } finally { for (const unsubscribe of release) unsubscribe(); }
}
