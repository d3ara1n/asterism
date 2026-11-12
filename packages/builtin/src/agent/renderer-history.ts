import type { RendererSessionSnapshot } from "@asterism-app/sdk/renderer";
import { agentInsightRead, agentMeasurementsRead } from "./context/insight.ts";
import { readRecordsAsync } from "../shared/record-reading.ts";

/** Remote consumers own cancellation; domain read plans are also used by synchronous runtime readers. */
export function readAgentInsight(snapshot: RendererSessionSnapshot, agentId: string, signal?: AbortSignal) {
  return readRecordsAsync(agentInsightRead(snapshot.records.index({ scope: "timeline" }), agentId),
    query => snapshot.records.all(query, { signal }), signal);
}

export function readAgentMeasurements(snapshot: RendererSessionSnapshot, agentId: string, signal?: AbortSignal) {
  return readRecordsAsync(agentMeasurementsRead(snapshot.records.index({ scope: "timeline" }), agentId),
    query => snapshot.records.all(query, { signal }), signal);
}
