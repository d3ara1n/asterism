import { mkdir, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { join } from "node:path";
import { contentRefSchema, type ContentRef, type ModelItem, type ModelRunEvent, type ModelTarget, type SystemPrompt } from "@asterism-app/sdk/contracts";
import type { ContentReader } from "@asterism-app/sdk/runtime";
import type { DelegationInput, TaskCompletion } from "./contract.ts";

export type AuditEntry =
  | { type: "delegation"; input: DelegationInput }
  | { type: "input"; messages: ModelItem[] }
  | { type: "steering-queued"; message: string }
  | { type: "steering-delivered"; messages: string[] }
  | { type: "request"; index: number; target: ModelTarget; system: SystemPrompt }
  | { type: "execution"; event: ModelRunEvent }
  | { type: "finished"; completion: TaskCompletion };

function attachments(value: unknown, found = new Map<string, ContentRef>()): Map<string, ContentRef> {
  if (!value || typeof value !== "object") return found;
  const reference = contentRefSchema.safeParse(value);
  if (reference.success) found.set(reference.data["$asterism.content"], reference.data);
  else for (const child of Object.values(value)) attachments(child, found);
  return found;
}

/** Audit text and referenced bytes remain in plugin storage after the temporary conversation closes. */
export async function saveAudit(directory: string, runId: string, entries: readonly AuditEntry[], content: ContentReader): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, `${runId}.jsonl`), entries.map(entry => JSON.stringify(entry)).join("\n") + "\n", { flag: "wx" });
  // Tool arguments can contain rejected or invented references; only delivered outcomes entered the conversation's content scope.
  const outputs = entries.flatMap(entry => {
    if (entry.type !== "execution") return [];
    const { event } = entry;
    return event.type === "block" && event.block.kind === "toolcall" && event.block.outcome
      ? [event.block.outcome] : [];
  });
  const refs = attachments(outputs);
  if (!refs.size) return;
  const files = join(directory, runId);
  await mkdir(files, { recursive: true });
  for (const [id, ref] of refs) await pipeline(content.open(ref), createWriteStream(join(files, id), { flags: "wx" }));
}
