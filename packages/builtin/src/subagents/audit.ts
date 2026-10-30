import { appendFile, mkdir, writeFile } from "node:fs/promises";
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
// Tool arguments can contain rejected or invented references; only delivered outcomes entered the conversation's content scope.
function delivered(entry: AuditEntry): ContentRef[] {
  if (entry.type !== "execution" || entry.event.type !== "block" || entry.event.block.kind !== "toolcall" || !entry.event.block.outcome) return [];
  return [...attachments(entry.event.block.outcome).values()];
}

/**
 * Append-only JSONL process record named by run ID. Entries serialize when appended; each line is written independently,
 * so an interrupted process loses at most its last line. Nothing is written for a run that never starts.
 */
export class AuditLog {
  private readonly file: string;
  private readonly files: string;
  private readonly buffered: AuditEntry[] = [];
  private readonly copied = new Set<string>();
  private content: ContentReader | null = null;
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly directory: string, runId: string) {
    this.file = join(directory, `${runId}.jsonl`);
    this.files = join(directory, runId);
  }

  append(entry: AuditEntry): void {
    if (!this.content) { this.buffered.push(structuredClone(entry)); return; }
    this.write(JSON.stringify(entry) + "\n", delivered(entry));
  }
  /** Begin writing with the run's content scope; attachments copy while that scope is open. */
  start(content: ContentReader): void {
    this.content = content;
    this.enqueue(async () => {
      await mkdir(this.directory, { recursive: true });
      await writeFile(this.file, "", { flag: "wx" });
    });
    for (const entry of this.buffered.splice(0)) this.append(entry);
  }
  /** Wait for pending writes; the first write failure is reported here. */
  close(): Promise<void> { return this.writing; }

  private write(line: string, refs: readonly ContentRef[]): void {
    const content = this.content!;
    const copies = refs.filter(ref => !this.copied.has(ref["$asterism.content"]));
    for (const ref of copies) this.copied.add(ref["$asterism.content"]);
    this.enqueue(async () => {
      await appendFile(this.file, line);
      if (copies.length) await mkdir(this.files, { recursive: true });
      for (const ref of copies)
        await pipeline(content.open(ref), createWriteStream(join(this.files, ref["$asterism.content"]), { flags: "wx" }));
    });
  }
  private enqueue(work: () => Promise<void>): void {
    this.writing = this.writing.then(work);
    // The chain is observed by close(); mark it handled so an early failure is not reported as unhandled.
    this.writing.catch(() => {});
  }
}
