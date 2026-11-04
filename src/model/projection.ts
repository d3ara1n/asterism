import { createHash } from "node:crypto";
import type { ModelPart } from "@asterism-app/sdk/contracts";
import { modelScope, type Json, type ModelSettings } from "../shared/model.ts";
import type { ModelInput, ModelValidationInput, ResolvedModelItem } from "./contract.ts";
import { modelProtocol } from "./protocols/index.ts";

/** Origin limits native supplementary data reuse only; it does not determine whether public text can participate in requests. */
export function canReuseContinuation(source: { scope: string; adapter: string }, target: ModelSettings): boolean {
  return source.adapter === modelProtocol(target.provider.protocol).continuationFormat && source.scope === modelScope(target);
}

export function validateProjection(input: ModelValidationInput): void {
  modelProtocol(input.settings.provider.protocol).validate?.(input);
}

function portableCallId(seed: string): string {
  return `call_${createHash("sha256").update(seed).digest("hex").slice(0, 40)}`;
}
const portableId = /^[A-Za-z0-9_-]{1,64}$/u;

/** Project immutable history each time; omit inapplicable native data without blocking public context.
 * Projected parts carry the target protocol's restored continuation record; foreign origins carry an empty record. */
export function projectHistory(input: ModelInput): ResolvedModelItem[] {
  validateProjection(input);
  const { settings } = input;
  const protocol = modelProtocol(settings.provider.protocol);
  const nativeIds = new Set(input.messages.flatMap(item => item.kind === "output" && canReuseContinuation(item, settings)
    ? item.parts.flatMap(part => part.kind === "toolcall" ? [part.callId] : []) : []));
  const usedIds = new Set<string>();
  const calls = new Map<string, string>();
  const projected: ResolvedModelItem[] = [];
  for (const [index, item] of input.messages.entries()) {
    if (item.kind === "result") {
      projected.push({ ...item, callId: calls.get(item.callId) ?? item.callId });
      continue;
    }
    if (item.kind !== "output") { projected.push(item); continue; }
    const native = canReuseContinuation(item, settings);
    const parts: ModelPart[] = [];
    for (const [partIndex, part] of item.parts.entries()) {
      const continuation: Record<string, Json> = native ? protocol.restore(part.continuation) : {};
      if (part.kind === "toolcall") {
        // Preserve this origin's original call IDs first; transform foreign IDs only when rejected by the target format or conflicting.
        const callId = native || (portableId.test(part.callId) && !nativeIds.has(part.callId) && !usedIds.has(part.callId))
          ? part.callId : portableCallId(JSON.stringify([item.scope, item.adapter, index, partIndex, part.callId]));
        calls.set(part.callId, callId);
        usedIds.add(callId);
        parts.push({ ...part, callId, continuation });
      } else if (part.kind === "text") {
        parts.push({ ...part, continuation });
      } else if (settings.model.capabilities.reasoning && protocol.replaysThinking(part, continuation)) {
        parts.push({ ...part, continuation });
      }
    }
    if (parts.length) projected.push({ ...item, parts });
  }
  return projected;
}
