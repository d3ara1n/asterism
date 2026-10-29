import type { McpServices, McpToolHandle } from "@asterism-app/sdk/runtime";
import type { McpApplication } from "../../mcp/application.ts";
import type { RunGroup } from "../lifecycle.ts";
import type { SdkScope } from "./scope.ts";

/** Capture tool identities while binding MCP operations and subscriptions to the plugin lifetime. */
export function bindMcp(mcp: McpApplication, sessionRuns: RunGroup, scope: SdkScope): McpServices {
  const { checkAvailable, subscribeRegistry } = scope;
  const outside = { affectsHistory: false } as const;
  return {
    states() { checkAvailable(); return structuredClone(mcp.service.states()); },
    catalog() { checkAvailable(); return structuredClone(mcp.service.catalog()); },
    connect(id, signal) {
      checkAvailable();
      return sessionRuns.start(scope => mcp.service.connectEnabled(id, scope), { ...outside, signal }).done;
    },
    resolve(id) {
      checkAvailable();
      const service = mcp.service, target = service.resolve(id);
      return Object.freeze<McpToolHandle>({
        serverId: target.serverId, serverName: target.serverName, toolName: target.toolName,
        call(args, options) {
          checkAvailable();
          const input = structuredClone(args);
          return sessionRuns.start(signal => service.call(target, input, signal, options.progress), { ...outside, signal: options.signal }).done;
        },
      });
    },
    subscribe: listener => subscribeRegistry(mcp, listener),
  };
}
