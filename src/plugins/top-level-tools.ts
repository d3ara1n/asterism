import { jsonSchema, reference, type Json, type ResourceRef, type ToolContract } from "@asterism/sdk/contracts";
import type { TopLevelTool } from "@asterism/sdk/runtime";
import type { Invocation } from "../tools/contract.ts";
import type { SdkContext } from "./sdk-context.ts";
import type { RunGroup } from "./lifecycle.ts";
import { resolveToolCompletion } from "../tools/result.ts";

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
      toModel: tool.toModel,
      execute: (signal, publish) => runs.start(async current => {
        current.throwIfAborted();
        const scope = { active: true, execution: true };
        let active = true;
        let latest: Json = null;
        const validate = (data: Json) => jsonSchema.parse(tool.resultSchema.parse(data));
        try {
          const result = await tool.execute(args, {
            object: sdk.reader(ref, scope), session: sdk.toolSession(ref, linked, scope, current), callId, signal: current,
            publish(data) {
              if (!active) return;
              latest = validate(data); publish?.(latest);
            },
          });
          if (result.data !== undefined && result.data !== null) result.data = validate(result.data);
          else if (result.kind === "succeeded" || result.kind === "partial") result.data = validate(result.data as Json);
          return resolveToolCompletion(result, latest);
        } finally { active = false; scope.active = false; }
      }, { object: ref, signal }).done,
    }),
  }));
}
