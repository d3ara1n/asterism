import type { ModelEvent, ModelItem, ModelPart, ToolCallInput } from "@asterism-app/sdk/contracts";
import type { PeekResult } from "./contract.ts";

type Finish = Extract<ModelEvent, { type: "finish" }>;
type Call = Extract<ModelPart, { kind: "toolcall" }>;
type Part = { value: Exclude<ModelPart, Call> | (Omit<Call, "input"> & { input: ToolCallInput | null }); ended: boolean };

/** Delivers tool calls only after a complete terminal state; native continuation data stays in this investigation's temporary messages. */
export async function collectPeekResponse(events: AsyncIterable<ModelEvent>, signal: AbortSignal, callbacks: {
  progress(phase: PeekResult["phase"], report: string): void;
  finish(event: Finish): void;
}) {
  const parts = new Map<string, Part>();
  let report = "";
  let finish: Finish | undefined;
  for await (const event of events) {
    signal.throwIfAborted();
    if (finish) throw new Error("The investigation stream continued after completion.");
    if (event.type === "finish") {
      finish = event; callbacks.finish(event);
      continue;
    }
    if (event.type === "part.start") {
      if (parts.has(event.part.id)) throw new Error("The investigation stream started a duplicate part.");
      const part = event.part;
      parts.set(part.id, { ended: false, value: part.kind === "toolcall"
        ? { kind: "toolcall", name: part.name, callId: part.callId, input: null, continuation: null }
        : part.kind === "thinking" ? { kind: "thinking", text: "", summary: "", continuation: null }
          : { kind: "text", text: "", continuation: null } });
      if (part.kind === "text" && report) {
        report = "";
        callbacks.progress("writing", report);
      }
      if (part.kind === "thinking" && !report) callbacks.progress("thinking", "");
      if (part.kind === "toolcall" && !report)
        callbacks.progress(part.name === "read_records" ? "reading" : "searching", "");
      continue;
    }
    const part = parts.get(event.partId);
    if (!part || part.ended) throw new Error("The investigation stream updated an inactive part.");
    if (event.type === "part.delta") {
      if (part.value.kind === "text") {
        part.value.text += event.delta;
        report = part.value.text;
        callbacks.progress("writing", report);
      } else if (part.value.kind === "thinking") {
        if (event.channel === "summary") part.value.summary += event.delta;
        else part.value.text += event.delta;
      }
    } else {
      part.ended = true; part.value.continuation = event.continuation ?? null;
      if (part.value.kind === "toolcall") part.value.input = event.input ?? null;
    }
  }
  signal.throwIfAborted();
  if (!finish) throw new Error("The investigation stream ended without completion.");
  const values = [...parts.values()];
  const ids = new Set<string>();
  const calls: Call[] = [];
  const outputParts: ModelPart[] = [];
  for (const { value } of values) {
    if (value.kind !== "toolcall") { outputParts.push(value); continue; }
    if (ids.has(value.callId)) throw new Error("The investigation response contains duplicate tool-call IDs.");
    ids.add(value.callId);
    if (!value.input) continue;
    const call = { ...value, input: value.input };
    outputParts.push(call);
    calls.push(call);
  }
  const complete = values.every(part => part.ended) && calls.length === ids.size;
  const output: Extract<ModelItem, { kind: "output" }> = {
    kind: "output", parts: outputParts,
    scope: finish.source?.scope ?? "", adapter: finish.source?.adapter ?? "",
  };
  return { finish, complete, calls, output, report: report.trim() };
}
