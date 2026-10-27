import { createHash, randomUUID, type Hash } from "node:crypto";
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { belongsTo, contentRefSchema, type ContentRef, type ContentRange, type Json } from "@asterism/sdk/contracts";
import { PluginApiError, type ContentReader, type ContentScope } from "@asterism/sdk/runtime";
import { contentChunkSize, contentReadLimit } from "../shared/content.ts";

/** Host implementation parameters: 1 MiB per chunk, 256 MiB per content item, 1 GiB temporary total, 16 MiB per read. */
export const contentLimits = { chunk: contentChunkSize, read: contentReadLimit, file: 256 * 1024 * 1024, temporary: 1024 * 1024 * 1024, scopes: 128, uploads: 16 } as const;
export const contentSchemaSql = `
  CREATE TABLE contents (id TEXT PRIMARY KEY, digest TEXT NOT NULL UNIQUE, size INTEGER NOT NULL) STRICT;
  CREATE TABLE content_roots (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    object_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('data', 'record')),
    root_id TEXT NOT NULL, content_id TEXT NOT NULL REFERENCES contents(id),
    PRIMARY KEY(session_id, object_id, kind, root_id, content_id)
  ) STRICT;
  CREATE INDEX content_roots_content ON content_roots(content_id);
  CREATE TABLE template_content_roots (
    template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    content_id TEXT NOT NULL REFERENCES contents(id),
    PRIMARY KEY(template_id, content_id)
  ) STRICT;
  CREATE INDEX template_content_roots_content ON template_content_roots(content_id);
`;
export interface ContentAccess { owner?: string; sessionId?: string; objectId?: string; templateId?: string; scope?: ContentLease; recordIds?: ReadonlySet<string>; allowHandover?: boolean; check?(): void }
export interface ContentTarget { contractId: string; resourceKind: string; sessionId?: string; objectId?: string }
export interface CapturedContent {
  reader: ContentReader;
  sizes: ReadonlyMap<string, number>;
  close(): Promise<void>;
}
interface Stored { id: string; size: number; digest: string }
interface Upload { id: string; scope: ContentLease; file: FileHandle; path: string; size: number; hash: Hash; tail: Promise<unknown>; sealed: boolean }
const unavailable = (message: string): never => { throw new PluginApiError("unavailable", message); };
const invalid = (message: string): never => { throw new PluginApiError("invalid_argument", message); };

/** Recognize complete SDK reference values only; continue recursively scanning ordinary JSON such as schema field definitions. */
export function contentReferences(value: Json): ContentRef[] {
  const refs = new Map<string, ContentRef>();
  const pending: Json[] = [value];
  while (pending.length) {
    const item = pending.pop()!;
    if (item === null || typeof item !== "object") continue;
    if (Array.isArray(item)) { for (const value of item) pending.push(value); continue; }
    if (Object.hasOwn(item, "$asterism.content")) {
      const parsed = contentRefSchema.safeParse(item);
      if (parsed.success) {
        refs.set(parsed.data["$asterism.content"], parsed.data);
        continue;
      }
    }
    for (const value of Object.values(item)) pending.push(value);
  }
  return [...refs.values()];
}

/** Drafts and attempts hold independently; close releases holds only after actual IO finishes. */
export class ContentLease {
  readonly id = randomUUID();
  readonly refs = new Set<string>();
  readonly controller = new AbortController();
  readonly pending = new Set<Promise<unknown>>();
  readonly readers = new Set<() => void>();
  closed = false;
  private closing?: Promise<void>;
  constructor(readonly store: ContentStore, readonly target?: ContentTarget) {}
  check(): void { if (this.closed || this.controller.signal.aborted) unavailable("The content scope is closed or cancelled."); }
  add(id: string): void { this.check(); if (!this.refs.has(id)) { this.refs.add(id); this.store.pin(id); } }
  track<T>(work: Promise<T>): Promise<T> {
    this.pending.add(work);
    void work.finally(() => this.pending.delete(work)).catch(() => {});
    return work;
  }
  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closed = true; this.controller.abort();
    this.closing = (async () => {
      await Promise.allSettled([...this.pending]);
      await this.store.abortScope(this);
      for (const release of [...this.readers]) release();
      for (const id of this.refs) this.store.unpin(id);
      this.refs.clear(); this.store.forget(this); this.store.releaseHandover(this);
    })();
    return this.closing;
  }
}

/** Seal files first and register references transactionally; one runtime serially coordinates references and reclamation. */
export class ContentStore {
  private readonly readers = new WeakMap<ContentReader["read"], ContentAccess>();
  private readonly pins = new Map<string, number>();
  private readonly leases = new Map<string, ContentLease>();
  private readonly uploads = new Map<string, Upload>();
  private readonly candidates = new Set<string>();
  /** Request holds for an object retain staged tool content until result records register roots; visible only to commits from the same object. */
  private readonly handovers = new Map<string, ContentLease>();
  handover(sessionId: string, objectId: string): ContentLease {
    const key = `${sessionId}\0${objectId}`, lease = this.scope();
    this.handovers.set(key, lease);
    return lease;
  }
  releaseHandover(lease: ContentLease): void {
    for (const [key, value] of this.handovers) if (value === lease) this.handovers.delete(key);
  }
  private collecting = false;
  private closed = false;
  constructor(private readonly db: DatabaseSync, private readonly root: string) {
    mkdirSync(join(root, "sealed"), { recursive: true });
    mkdirSync(join(root, "temporary"), { recursive: true });
  }
  /** Called explicitly by application startup after data preparation and reference validation. */
  collectStartup(): void {
    const { db, root } = this;
    rmSync(join(root, "temporary"), { recursive: true, force: true });
    mkdirSync(join(root, "temporary"), { recursive: true });
    // Crashes can occur between sealing and indexing; clean up only files owned by this module.
    const known = new Set((db.prepare("SELECT id FROM contents").all() as { id: string }[]).map(row => row.id));
    for (const name of readdirSync(join(root, "sealed"))) if (!known.has(name)) rmSync(join(root, "sealed", name), { force: true });
    for (const { id } of db.prepare(`SELECT id FROM contents
      WHERE NOT EXISTS (SELECT 1 FROM content_roots r WHERE r.content_id = contents.id)
      AND NOT EXISTS (SELECT 1 FROM template_content_roots r WHERE r.content_id = contents.id)`).all() as { id: string }[])
      this.candidates.add(id);
    this.collect();
  }
  /** Total sealed content without roots; recalculate only when roots or content sets change, without scanning the table for every chunk write. */
  private unrooted?: number;
  private unrootedSize(): number {
    return this.unrooted ??= (this.db.prepare(`SELECT COALESCE(SUM(size), 0) AS size FROM contents
      WHERE NOT EXISTS (SELECT 1 FROM content_roots r WHERE r.content_id = contents.id)
      AND NOT EXISTS (SELECT 1 FROM template_content_roots r WHERE r.content_id = contents.id)`).get() as { size: number }).size;
  }
  private path(id: string): string { return join(this.root, "sealed", id); }
  scope(target?: ContentTarget): ContentLease {
    if (this.closed) unavailable("The content store is closed.");
    if (this.leases.size >= contentLimits.scopes) invalid("Too many active content inputs.");
    const scope = new ContentLease(this, target && { ...target });
    this.leases.set(scope.id, scope); return scope;
  }
  getScope(id: string): ContentLease { const scope = this.leases.get(id); if (!scope) unavailable("The content input is unavailable."); scope!.check(); return scope!; }
  fork(id: string | undefined, target: ContentTarget): ContentLease {
    const source = id ? this.getScope(id) : undefined;
    if (source) {
      const bound = source.target;
      if (!bound || bound.contractId !== target.contractId || bound.resourceKind !== target.resourceKind
        || bound.sessionId !== undefined && bound.sessionId !== target.sessionId
        || bound.objectId !== target.objectId) invalid("The content input belongs to another command.");
    }
    const scope = this.scope(target);
    for (const ref of source?.refs ?? []) scope.add(ref);
    return scope;
  }
  pin(id: string): void { this.pins.set(id, (this.pins.get(id) ?? 0) + 1); }
  unpin(id: string): void { const count = (this.pins.get(id) ?? 1) - 1; if (count) this.pins.set(id, count); else { this.pins.delete(id); this.candidates.add(id); } this.scheduleCollection(); }
  forget(scope: ContentLease): void { this.leases.delete(scope.id); this.scheduleCollection(); }
  private scheduleCollection(): void {
    if (this.collecting || this.closed) return;
    this.collecting = true;
    queueMicrotask(() => { this.collecting = false; if (!this.closed) this.collect(); });
  }
  collect(): void {
    // Does not interleave with synchronous write transactions; active IO pins before the first await.
    if (this.db.isTransaction) return;
    for (const id of [...this.candidates]) {
      if (this.pins.has(id)) continue;
      if (this.db.prepare("SELECT 1 FROM content_roots WHERE content_id = ? UNION ALL SELECT 1 FROM template_content_roots WHERE content_id = ? LIMIT 1").get(id, id)) { this.candidates.delete(id); continue; }
      try { rmSync(this.path(id), { force: true }); this.db.prepare("DELETE FROM contents WHERE id = ?").run(id); this.unrooted = undefined; }
      catch { console.error("Unreferenced content could not be removed."); }
      this.candidates.delete(id);
    }
  }
  private stored(ref: ContentRef): Stored {
    const parsed = contentRefSchema.safeParse(ref);
    if (!parsed.success) invalid("Invalid content reference.");
    const row = this.db.prepare("SELECT id, size, digest FROM contents WHERE id = ?").get(parsed.data!["$asterism.content"]) as Stored | undefined;
    if (!row) unavailable("The referenced content is unavailable.");
    return row!;
  }
  assert(ref: ContentRef, access: ContentAccess): Stored {
    access.check?.(); access.scope?.check();
    const row = this.stored(ref);
    if (access.scope?.refs.has(row.id)) return row;
    if (access.templateId && this.db.prepare("SELECT 1 FROM template_content_roots WHERE template_id = ? AND content_id = ?")
      .get(access.templateId, row.id)) return row;
    if (access.allowHandover !== false && access.sessionId && this.handovers.get(`${access.sessionId}\0${access.objectId ?? ""}`)?.refs.has(row.id)) return row;
    if (access.sessionId) {
      const roots = this.db.prepare("SELECT kind, root_id FROM content_roots WHERE session_id = ? AND object_id = ? AND content_id = ?")
        .all(access.sessionId, access.objectId ?? "", row.id) as { kind: string; root_id: string }[];
      if (roots.some(root => root.kind === "data"
        ? !access.owner || belongsTo(access.owner, root.root_id)
        : access.recordIds?.has(root.root_id))) return row;
    }
    throw new PluginApiError("foreign_resource", "The content does not belong to this input or object.");
  }
  validate(value: Json, access: ContentAccess): void { for (const ref of contentReferences(value)) this.assert(ref, access); }
  /** Templates hold independent persistent dependency roots; new object content roots can still be created after source session deletion. */
  bindTemplate(templateId: string, access: ContentAccess, value: Json): void {
    if (!this.db.isTransaction) throw new Error("Template content roots require a transaction.");
    const insert = this.db.prepare("INSERT OR IGNORE INTO template_content_roots VALUES (?, ?)");
    for (const ref of contentReferences(value)) {
      const row = this.assert(ref, access);
      insert.run(templateId, row.id);
    }
    this.unrooted = undefined;
  }
  releaseTemplate(templateId: string): void {
    if (!this.db.isTransaction) throw new Error("Template content roots require a transaction.");
    for (const row of this.db.prepare("SELECT content_id FROM template_content_roots WHERE template_id = ?").all(templateId) as { content_id: string }[])
      this.candidates.add(row.content_id);
    this.db.prepare("DELETE FROM template_content_roots WHERE template_id = ?").run(templateId);
    this.unrooted = undefined;
    this.scheduleCollection();
  }
  /** Check and retain the complete batch before the first asynchronous wait; later reads do not borrow input draft lifetimes. */
  capture(refs: readonly ContentRef[], access: ContentAccess): CapturedContent {
    const sizes = new Map<string, number>();
    const scope = this.scope();
    try {
      for (const ref of refs) {
        const row = this.assert(ref, access);
        scope.add(row.id); sizes.set(row.id, row.size);
      }
      return { reader: this.reader({ scope }), sizes, close: () => scope.close() };
    } catch (error) { void scope.close(); throw error; }
  }
  captureReader(refs: readonly ContentRef[], reader: ContentReader | undefined, owner: string): CapturedContent {
    const access = reader && this.readers.get(reader.read);
    if (!access || access.owner !== owner)
      throw new PluginApiError("foreign_resource", "Use a content reader from the current plugin context.");
    return this.capture(refs, access);
  }
  /** Register roots within the owning transaction; access scopes supply session and object identities without passing them twice. */
  bind(access: ContentAccess & { sessionId: string }, root: { kind: "data" | "record"; id: string }, value: Json): void {
    const refs = contentReferences(value), sessionId = access.sessionId, objectId = access.objectId ?? "";
    for (const ref of refs) this.assert(ref, access);
    if (this.db.isTransaction === false) throw new Error("Content roots must be saved inside the owning transaction.");
    if (root.kind === "data") {
      for (const row of this.db.prepare("SELECT content_id FROM content_roots WHERE session_id = ? AND object_id = ? AND kind = ? AND root_id = ?")
        .all(sessionId, objectId, root.kind, root.id) as { content_id: string }[]) this.candidates.add(row.content_id);
      this.db.prepare("DELETE FROM content_roots WHERE session_id = ? AND object_id = ? AND kind = ? AND root_id = ?")
        .run(sessionId, objectId, root.kind, root.id);
    }
    // Records append only; terminal metadata may reference the same physical block again without revoking its body dependencies.
    const insert = this.db.prepare("INSERT OR IGNORE INTO content_roots VALUES (?, ?, ?, ?, ?)");
    for (const ref of refs) insert.run(sessionId, objectId, root.kind, root.id, ref["$asterism.content"]);
    this.unrooted = undefined; this.scheduleCollection();
  }
  async begin(scope: ContentLease): Promise<string> {
    scope.check();
    if (this.uploads.size >= contentLimits.uploads) invalid("Too many content uploads.");
    const id = randomUUID(), path = join(this.root, "temporary", id);
    // Reserve slots so concurrent opens cannot exceed upload limits after awaiting.
    const upload = { id, scope, path, size: 0, hash: createHash("sha256"), tail: Promise.resolve(), sealed: false } as Upload;
    this.uploads.set(id, upload);
    try { upload.file = await open(path, "wx", 0o600); scope.check(); return id; }
    catch (error) { await upload.file?.close(); this.uploads.delete(id); rmSync(path, { force: true }); throw error; }
  }
  private upload(scope: ContentLease, id: string): Upload {
    scope.check(); const upload = this.uploads.get(id);
    if (!upload || upload.scope !== scope || upload.sealed) invalid("The upload is unavailable in this content scope.");
    return upload!;
  }
  write(scope: ContentLease, id: string, offset: number, data: Uint8Array): Promise<void> {
    const upload = this.upload(scope, id);
    const bytes = Uint8Array.from(data);
    const work = upload.tail.then(async () => {
      scope.check();
      if (upload.sealed || !Number.isSafeInteger(offset) || offset !== upload.size || bytes.byteLength > contentLimits.chunk)
        invalid("Invalid content chunk or upload offset.");
      if (upload.size + bytes.byteLength > contentLimits.file) invalid("The content exceeds the size limit.");
      const temporary = this.unrootedSize();
      if (temporary + [...this.uploads.values()].reduce((sum, value) => sum + value.size, 0) + bytes.length > contentLimits.temporary)
        invalid("The temporary content capacity has been reached.");
      const start = upload.size;
      // Reserve capacity before the first await so separate uploads cannot exceed the global limit together.
      upload.size += bytes.length;
      let written = 0;
      while (written < bytes.length) {
        const result = await upload.file.write(bytes, written, bytes.length - written, start + written);
        if (!result.bytesWritten) throw new Error("Content write made no progress.");
        written += result.bytesWritten;
      }
      upload.hash.update(bytes);
    });
    upload.tail = work; return scope.track(work);
  }
  seal(scope: ContentLease, id: string): Promise<ContentRef> {
    const upload = this.upload(scope, id);
    const work = upload.tail.then(async () => {
      scope.check(); if (upload.sealed) invalid("The upload is already sealed.");
      upload.sealed = true;
      await upload.file.sync(); await upload.file.close(); scope.check();
      const digest = upload.hash.digest("hex");
      const existing = this.db.prepare("SELECT id, size FROM contents WHERE digest = ?").get(digest) as Stored | undefined;
      let contentId = existing?.id ?? randomUUID();
      if (existing) {
        if (existing.size !== upload.size) throw new Error("Content digest collision.");
        rmSync(upload.path, { force: true });
      } else {
        renameSync(upload.path, this.path(contentId));
        this.db.prepare("INSERT INTO contents VALUES (?, ?, ?)").run(contentId, digest, upload.size); this.unrooted = undefined;
      }
      scope.add(contentId); this.uploads.delete(id);
      return { "$asterism.content": contentId };
    });
    upload.tail = work; return scope.track(work);
  }
  async abort(scope: ContentLease, id: string): Promise<void> {
    const upload = this.uploads.get(id);
    if (!upload || upload.scope !== scope) return;
    await upload.tail.catch(() => {});
    await upload.file?.close().catch(() => {});
    rmSync(upload.path, { force: true }); this.uploads.delete(id);
  }
  async abortScope(scope: ContentLease): Promise<void> { await Promise.all([...this.uploads.values()].filter(u => u.scope === scope).map(u => this.abort(scope, u.id))); }
  private range(row: Stored, range: ContentRange = {}): { offset: number; length: number } {
    const offset = range.offset ?? 0, length = range.length ?? Math.max(0, row.size - offset);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > row.size || !Number.isSafeInteger(length) || length < 0) invalid("Invalid content read range.");
    return { offset, length: Math.min(length, row.size - offset) };
  }
  private async readBytes(row: Stored, offset: number, length: number): Promise<Uint8Array> {
    const file = await open(this.path(row.id), "r").catch(() => unavailable("The content file is unavailable."));
    try {
      if ((await file.stat()).size !== row.size) unavailable("The content file is damaged.");
      const bytes = new Uint8Array(length); let read = 0;
      while (read < length) {
        const result = await file.read(bytes, read, length - read, offset + read);
        if (!result.bytesRead) unavailable("The content file is incomplete.");
        read += result.bytesRead;
      }
      if (offset === 0 && length === row.size && createHash("sha256").update(bytes).digest("hex") !== row.digest) unavailable("The content file is damaged.");
      return bytes;
    } finally { await file.close(); }
  }
  reader(access: ContentAccess): ContentReader {
    const reader: ContentReader = {
      read: (ref, range) => {
        const row = this.assert(ref, access), part = this.range(row, range);
        if (part.length > contentLimits.read) invalid("Use a content stream or bounded range for large content.");
        access.scope?.add(row.id);
        this.pin(row.id);
        const work = this.readBytes(row, part.offset, part.length).finally(() => this.unpin(row.id));
        return access.scope ? access.scope.track(work) : work;
      },
      open: (ref, range) => this.stream(ref, access, range),
    };
    this.readers.set(reader.read, access);
    return reader;
  }
  private async *stream(ref: ContentRef, access: ContentAccess, range?: ContentRange): AsyncIterable<Uint8Array> {
    const row = this.assert(ref, access), part = this.range(row, range); this.pin(row.id);
    access.scope?.add(row.id);
    let released = false;
    const release = () => { if (!released) { released = true; this.unpin(row.id); access.scope?.readers.delete(release); } };
    access.scope?.readers.add(release);
    const hash = part.offset === 0 && part.length === row.size ? createHash("sha256") : null;
    try {
      for (let position = 0; position < part.length; position += contentLimits.chunk) {
        access.check?.(); access.scope?.check();
        const work = this.readBytes(row, part.offset + position, Math.min(contentLimits.chunk, part.length - position));
        const bytes = await (access.scope ? access.scope.track(work) : work);
        hash?.update(bytes); yield bytes;
      }
      if (hash && hash.digest("hex") !== row.digest) unavailable("The content file is damaged.");
    } finally { release(); }
  }
  writer(access: ContentAccess): ContentScope {
    return { ...this.reader(access), stage: source => {
      access.check?.(); const scope = access.scope;
      if (!scope) unavailable("Content staging requires an active preparation or execution.");
      scope!.check();
      const work = (async () => {
        const id = await this.begin(scope!); let offset = 0;
        try {
          const parts = source instanceof Uint8Array ? [source] : source;
          for await (const part of parts) {
            scope!.check();
            if (!(part instanceof Uint8Array)) invalid("Content sources must yield byte arrays.");
            for (let start = 0; start < part.length; start += contentLimits.chunk) {
              const chunk = part.subarray(start, start + contentLimits.chunk);
              await this.write(scope!, id, offset, chunk); offset += chunk.length;
            }
          }
          return await this.seal(scope!, id);
        } catch (error) { await this.abort(scope!, id); throw error; }
      })();
      return scope!.track(work);
    } };
  }
  async close(): Promise<void> {
    this.closed = true;
    await Promise.all([...this.leases.values()].map(scope => scope.close()));
    this.collect();
  }
}
