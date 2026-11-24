import { existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
import { ContentStore, contentSchemaSql } from "./content-store.ts";

const fixtures: { db: DatabaseSync; root: string; store: ContentStore }[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "asterism-content-store-"));
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE sessions(id TEXT PRIMARY KEY); CREATE TABLE templates(id TEXT PRIMARY KEY);" + contentSchemaSql);
  const store = new ContentStore(db, root);
  fixtures.push({ db, root, store });
  return { db, store, root, sealed: join(root, "sealed") };
}
afterEach(async () => {
  for (const { db, root, store } of fixtures.splice(0)) { await store.close(); db.close(); rmSync(root, { recursive: true, force: true }); }
  vi.restoreAllMocks();
});

it("reclaims a file renamed for an upload whose index insert fails, without waiting for startup", async () => {
  const { db, store, sealed } = fixture();
  db.exec("CREATE TRIGGER fail_insert BEFORE INSERT ON contents BEGIN SELECT RAISE(FAIL, 'test insert failure'); END;");
  const scope = store.scope();
  await expect(store.writer({ scope }).stage(Uint8Array.of(1))).rejects.toThrow("test insert failure");
  expect(readdirSync(sealed)).toEqual([]);
});

it("keeps bytes available for deduplication when dropping the index fails", async () => {
  const { db, store } = fixture();
  const bytes = Uint8Array.of(1), scope = store.scope();
  const original = await store.writer({ scope }).stage(bytes);
  db.exec("CREATE TRIGGER fail_delete BEFORE DELETE ON contents BEGIN SELECT RAISE(FAIL, 'test delete failure'); END;");
  vi.spyOn(console, "error").mockImplementation(() => {});
  await scope.close();
  db.exec("DROP TRIGGER fail_delete;");
  const retry = store.writer({ scope: store.scope() });
  const ref = await retry.stage(bytes);
  expect(ref).toEqual(original);
  expect(await retry.read(ref)).toEqual(bytes);
});

it("retries failed unlink without returning the detached file's index on a subsequent upload", async () => {
  const { store, root, sealed } = fixture();
  const bytes = Uint8Array.of(1), scope = store.scope();
  const original = await store.writer({ scope }).stage(bytes);
  const path = join(sealed, original["$asterism.content"]), held = join(root, "held");
  // A directory at this path makes non-recursive removal fail on all supported platforms.
  renameSync(path, held); mkdirSync(path);
  vi.spyOn(console, "error").mockImplementation(() => {});
  await scope.close();
  rmdirSync(path); renameSync(held, path);
  const writer = store.writer({ scope: store.scope() });
  const ref = await writer.stage(bytes);
  expect(ref).not.toEqual(original);
  expect(await writer.read(ref)).toEqual(bytes);
  store.collect();
  expect(existsSync(path)).toBe(false);
});
