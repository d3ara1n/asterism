import type { StreamRequest, UsageItem } from "@atelier/sdk/contracts";
import type { PluginContext } from "@atelier/sdk/runtime";

/** 示例消费者：请求前主动查询，按响应连接的当前目录解析响应头。 */
export async function* streamWithUsage(plugin: PluginContext, connectionId: string, request: StreamRequest,
  receive: (items: UsageItem[]) => void) {
  const connection = plugin.providers.get(connectionId);
  const usage = connection?.enabled && connection.usage ? plugin.usages.get(connection.usage) : null;
  if (connection && usage && usage.source !== "headers") {
    const credential = await plugin.providers.credential(connection.id, { signal: request.signal });
    const items = await usage.query({ connection: { id: connection.id, endpoint: connection.baseUrl }, credential, signal: request.signal });
    receive(items);
  }
  for await (const event of plugin.models.stream(request)) {
    const response = event.type === "finish" ? event.response : null;
    if (response) {
      const current = plugin.providers.get(response.connection.id);
      const parser = current?.enabled && current.usage ? plugin.usages.get(current.usage) : null;
      if (parser?.source === "headers") {
        try {
          const items = parser.parseHeaders({ connection: { id: response.connection.id, endpoint: response.endpoint },
            model: response.model, status: response.status, receivedAt: response.receivedAt, headers: response.headers });
          if (items !== null) receive(items);
        } catch { plugin.log.warn("Usage response parsing failed."); }
      }
    }
    yield event;
  }
}
