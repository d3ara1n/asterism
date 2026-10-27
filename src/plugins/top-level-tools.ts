import { defaultToolModel, reference, type Json, type ResourceRef, type ToolContract } from "@asterism-app/sdk/contracts";
import { PluginApiError, type TopLevelTool } from "@asterism-app/sdk/runtime";
import type { Invocation } from "../tools/contract.ts";
import type { SdkContext } from "./sdk-context.ts";
import type { RunGroup } from "./lifecycle.ts";
import { resolveToolCompletion } from "../tools/result.ts";
import { encodePluginData } from "./data-encoding.ts";

export interface BoundTopLevelTool {
  tool: ToolContract;
  resolve(args: Json, callId: string): Invocation;
}
export interface RegisteredTopLevelTool { tool: TopLevelTool; sdk: SdkContext; runs: RunGroup }
export function bindTopLevelTools(entries: readonly RegisteredTopLevelTool[], ref: ResourceRef, policy: (name: string) => boolean, linked: readonly ResourceRef[]): BoundTopLevelTool[] {
  return entries.filter(entry => policy(entry.tool.name)).map(({ tool, sdk, runs }) => ({
    tool,
    resolve: (args, callId) => ({
      implementation: reference(tool), effect: tool.effect, execution: tool.execution,
      toModel: data => {
        const decoded = tool.resultSchema.parse(data);
        return tool.toModel ? tool.toModel(decoded) : defaultToolModel(decoded);
      },
      execute: (signal, publish) => runs.start(async current => {
        current.throwIfAborted();
        const scope = { active: true, execution: true };
        let active = true;
        let latest: Json = null;
        const encode = (data: Json) => {
          const encoded = encodePluginData({ id: tool.id, schema: tool.resultSchema }, data);
          if (encoded === null && data !== null)
            throw new PluginApiError("invalid_argument", `${tool.id}: non-null tool results require a non-null encoding; null denotes absent output.`);
          return encoded;
        };
        try {
          const result = await tool.execute(args, {
            object: sdk.reader(ref, scope), session: sdk.toolSession(ref, linked, scope, current), callId, signal: current,
            publish(data) {
              if (!active) return;
              latest = encode(data); publish?.(latest);
            },
          });
          const withData = result.data !== undefined && result.data !== null || result.kind === "succeeded" || result.kind === "partial";
          return resolveToolCompletion(withData ? { ...result, data: encode(result.data as Json) } : result, latest);
        } finally { active = false; scope.active = false; }
      }, { object: ref, signal }).done,
    }),
  }));
}
