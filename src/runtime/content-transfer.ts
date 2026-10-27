import { randomUUID } from "node:crypto";
import { PluginApiError } from "@asterism/sdk/runtime";
import { contentCommandSchema, type ContentCommand, type ContentReply } from "../shared/content.ts";
import type { SessionService } from "./sessions.ts";
import type { ContentLease, ContentAccess } from "./content-store.ts";

interface Reader { iterator: AsyncIterator<Uint8Array>; first?: IteratorResult<Uint8Array>; tail: Promise<unknown> }
/** Desktop content transfer manages frontend drafts only; backend commits capture independent holds that reset does not revoke. */
export class ContentTransferService {
  private readonly inputs = new Map<string, ContentLease>();
  private readonly readers = new Map<string, Reader>();
  private closed = false;
  constructor(private readonly sessions: SessionService) {}
  private scope(id: string): ContentLease {
    const scope = this.inputs.get(id);
    if (!scope) throw new PluginApiError("unavailable", "The content input is unavailable.");
    scope.check(); return scope;
  }
  private access(source: Extract<ContentCommand, { type: "read.open" }>["source"]): ContentAccess {
    if ("scopeId" in source) return { scope: this.scope(source.scopeId) };
    const path = this.sessions.tree.timeline(source.sessionId);
    if (!this.sessions.tree.workbench(source.sessionId).objects.some(object => object.id === source.objectId))
      throw new PluginApiError("foreign_resource", "The content object is not on the current session path.");
    return { sessionId: source.sessionId, objectId: source.objectId, recordIds: new Set(path.map(node => node.id)) };
  }
  async execute(raw: unknown): Promise<ContentReply> {
    if (this.closed) throw new PluginApiError("unavailable", "Content transfer is closed.");
    const parsed = contentCommandSchema.safeParse(raw);
    if (!parsed.success) throw new PluginApiError("invalid_argument", "Invalid content command.");
    const command = parsed.data, store = this.sessions.content;
    switch (command.type) {
      case "input.open": {
        const scope = this.sessions.openContentInput(command.target); this.inputs.set(scope.id, scope);
        return { kind: "input", scopeId: scope.id };
      }
      case "input.close": {
        const scope = this.inputs.get(command.scopeId); this.inputs.delete(command.scopeId);
        await scope?.close(); return { kind: "done" };
      }
      case "upload.begin": {
        const scope = this.scope(command.scopeId);
        const uploadId = await scope.track(store.begin(scope)); return { kind: "upload", uploadId };
      }
      case "upload.write":
        await store.write(this.scope(command.scopeId), command.uploadId, command.offset, command.data); return { kind: "done" };
      case "upload.seal":
        return { kind: "content", ref: await store.seal(this.scope(command.scopeId), command.uploadId) };
      case "upload.abort":
        await store.abort(this.scope(command.scopeId), command.uploadId); return { kind: "done" };
      case "read.open": {
        if (this.readers.size >= 32) throw new PluginApiError("unavailable", "Too many content readers.");
        const iterator = store.reader(this.access(command.source)).open(command.ref, command.range)[Symbol.asyncIterator]();
        const reader: Reader = { iterator, tail: Promise.resolve() }, readerId = randomUUID();
        this.readers.set(readerId, reader);
        const first = iterator.next(); reader.tail = first;
        try { reader.first = await first; return { kind: "reader", readerId }; }
        catch (error) { this.readers.delete(readerId); await iterator.return?.(); throw error; }
      }
      case "read.next": {
        const reader = this.readers.get(command.readerId);
        if (!reader) throw new PluginApiError("unavailable", "The content reader is closed.");
        const work = reader.tail.then(async () => {
          const next = reader.first ?? await reader.iterator.next(); reader.first = undefined;
          if (next.done) this.readers.delete(command.readerId);
          return { kind: "bytes" as const, data: next.value ?? new Uint8Array(), done: next.done === true };
        });
        reader.tail = work;
        try { return await work; }
        catch (error) { this.readers.delete(command.readerId); await reader.iterator.return?.(); throw error; }
      }
      case "read.close": await this.closeReader(command.readerId); return { kind: "done" };
      case "reset": await this.reset(); return { kind: "done" };
    }
  }
  private async closeReader(id: string): Promise<void> {
    const reader = this.readers.get(id); this.readers.delete(id);
    if (reader) { await reader.tail.catch(() => {}); await reader.iterator.return?.(); }
  }
  private async reset(): Promise<void> {
    const inputs = [...this.inputs.values()]; this.inputs.clear();
    await Promise.all([...this.readers.keys()].map(id => this.closeReader(id)));
    await Promise.all(inputs.map(scope => scope.close()));
  }
  async close(): Promise<void> { this.closed = true; await this.reset(); }
}
