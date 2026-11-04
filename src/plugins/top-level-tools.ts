import { defaultToolModel, reference, type Json, type ResourceRef, type ToolContract } from "@asterism-app/sdk/contracts";
import { PluginApiError, type TopLevelTool, type ToolCaller } from "@asterism-app/sdk/runtime";
import type { Invocation, PreparedResult } from "../tools/contract.ts";
import type { SdkContext } from "./sdk-context.ts";
import type { RunGroup } from "./lifecycle.ts";
import { interactionUnavailable, resolveToolCompletion } from "../tools/result.ts";
import { encodePluginData } from "./data-encoding.ts";

export interface BoundTopLevelTool {
  tool: ToolContract;
  available: boolean;
  resolve(args: Json, callId: string, interactive?: boolean): Invocation | PreparedResult;
}
export interface RegisteredTopLevelTool { tool: TopLevelTool; sdk: SdkContext; runs: RunGroup }
export function bindTopLevelTools(entries: readonly RegisteredTopLevelTool[], caller: ToolCaller, policy: (name: string) => boolean, linked: readonly ResourceRef[], requestInteractive: boolean): BoundTopLevelTool[] {
  const ref = caller.ref;
  return entries.filter(entry => policy(entry.tool.name)).map(({ tool, sdk, runs }) => ({
    tool,
    available: requestInteractive || !tool.requiresInteraction,
    resolve(args, callId, interactive = requestInteractive) {
      const canInteract = requestInteractive && interactive;
      if (!canInteract && tool.requiresInteraction) return interactionUnavailable();
      return {
        implementation: reference(tool), effect: tool.effect, execution: tool.execution,
        toModel: data => {
          const decoded = tool.resultSchema.parse(data);
          return tool.toModel ? tool.toModel(decoded) : defaultToolModel(decoded);
        },
        execute: (signal, publish) => runs.start(async current => {
          current.throwIfAborted();
          const scope = { active: true, execution: true };
          let latest: Json = null;
          const encode = (data: Json) => {
            const encoded = encodePluginData({ id: tool.id, schema: tool.resultSchema }, data);
            if (encoded === null && data !== null)
              throw new PluginApiError("invalid_argument", `${tool.id}: non-null tool results require a non-null encoding; null denotes absent output.`);
            return encoded;
          };
          try {
            const result = await tool.execute(args, {
              object: sdk.reader(ref, scope), caller, session: sdk.toolSession(ref, linked, scope, current), callId, signal: current, interactive: canInteract,
              publish(data) {
                if (!scope.active) return;
                latest = encode(data); publish?.(latest);
              },
            });
            const withData = result.data !== undefined && result.data !== null || result.kind === "succeeded" || result.kind === "partial";
            return resolveToolCompletion(withData ? { ...result, data: encode(result.data as Json) } : result, latest);
          } finally { scope.active = false; }
        }, { object: ref, signal, affectsHistory: false }).done,
      };
    },
  }));
}
