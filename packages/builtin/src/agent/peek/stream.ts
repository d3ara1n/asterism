import type { ModelEvent, ModelItem, ModelPart } from "@asterism/sdk/contracts";
import { PeekReport } from "./report.ts";
import type { PeekResult } from "./contract.ts";

type Finish = Extract<ModelEvent, { type: "finish" }>;
type Part = { value: ModelPart; ended: boolean; argumentsReady: boolean };

/** 仅在完整终态之后交付工具调用；原生续接资料留在本次调查的临时消息中。 */
export async function collectPeekResponse(events: AsyncIterable<ModelEvent>, signal: AbortSignal, callbacks: {
  progress(phase: PeekResult["phase"], report: string): void;
  finish(event: Finish): void;
}) {
  const parts = new Map<string, Part>(), report = new PeekReport();
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
      parts.set(part.id, { ended: false, argumentsReady: false, value: part.kind === "toolcall"
        ? { kind: "toolcall", name: part.name, callId: part.callId, arguments: null, continuation: null }
        : part.kind === "thinking" ? { kind: "thinking", text: "", summary: "", continuation: null }
          : { kind: "text", text: "", continuation: null } });
      if (part.kind === "thinking" && !report.text) callbacks.progress("thinking", "");
      if (part.kind === "toolcall" && !report.text)
        callbacks.progress(part.name === "read_records" ? "reading" : "searching", "");
      continue;
    }
    const part = parts.get(event.partId);
    if (!part || part.ended) throw new Error("The investigation stream updated an inactive part.");
    if (event.type === "part.delta") {
      if (part.value.kind === "text") {
        part.value.text += event.delta; report.push(event.delta);
        if (report.text) callbacks.progress("writing", report.text);
      } else if (part.value.kind === "thinking") {
        if (event.channel === "summary") part.value.summary += event.delta;
        else part.value.text += event.delta;
      }
    } else {
      part.ended = true; part.value.continuation = event.continuation ?? null;
      if (part.value.kind === "toolcall" && event.arguments !== undefined) {
        part.value.arguments = event.arguments; part.argumentsReady = true;
      }
    }
  }
  signal.throwIfAborted();
  if (!finish) throw new Error("The investigation stream ended without completion.");
  const values = [...parts.values()];
  const calls = values.flatMap(part => part.value.kind === "toolcall" ? [part.value] : []);
  const complete = values.every(part => part.ended && (part.value.kind !== "toolcall" || part.argumentsReady));
  if (new Set(calls.map(call => call.callId)).size !== calls.length)
    throw new Error("The investigation response contains duplicate tool-call IDs.");
  const lastText = values.findLast(part => part.value.kind === "text")?.value;
  const text = report.finish(lastText?.kind === "text" ? lastText.text : "");
  const output: Extract<ModelItem, { kind: "output" }> = {
    kind: "output", parts: values.map(part => part.value),
    scope: finish.source?.scope ?? "", adapter: finish.source?.adapter ?? "",
  };
  return { finish, complete, calls, output, report: text };
}
