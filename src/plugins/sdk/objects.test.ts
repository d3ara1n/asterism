import { getEventListeners } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it } from "vitest";
import { ContentStore } from "../../runtime/content-store.ts";
import { linkAbort } from "./objects.ts";

const fixtures: { store: ContentStore; db: DatabaseSync; root: string }[] = [];
function contentStore(): ContentStore {
  const root = mkdtempSync(join(tmpdir(), "asterism-content-abort-"));
  const db = new DatabaseSync(":memory:");
  const store = new ContentStore(db, root);
  fixtures.push({ store, db, root });
  return store;
}

afterEach(async () => {
  for (const { store, db, root } of fixtures.splice(0)) {
    await store.close();
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it("closing a lease detaches its cancellation listener without cancelling the caller or another active lease", async () => {
  const store = contentStore();
  const caller = new AbortController();
  const signal = AbortSignal.any([caller.signal, new AbortController().signal]);
  const finished = store.scope(), active = store.scope();
  linkAbort(finished, signal);
  linkAbort(active, signal);
  await finished.close();
  // This registration was the strong root retaining closed leases and completed request captures.
  expect(getEventListeners(signal, "abort")).toHaveLength(1);
  expect(signal.aborted).toBe(false);
  expect(active.controller.signal.aborted).toBe(false);
  caller.abort();
  expect(active.controller.signal.aborted).toBe(true);
  expect(() => active.check()).toThrow("The content scope is closed or cancelled.");
});

it("does not attach a fresh upstream listener to an already closed lease", async () => {
  const store = contentStore(), lease = store.scope();
  const caller = new AbortController();
  await lease.close();
  linkAbort(lease, caller.signal);
  expect(getEventListeners(caller.signal, "abort")).toHaveLength(0);
  expect(caller.signal.aborted).toBe(false);
});

it("an already cancelled caller immediately cancels the lease without registering a listener", () => {
  const store = contentStore(), lease = store.scope();
  const caller = new AbortController();
  caller.abort();
  linkAbort(lease, caller.signal);
  expect(() => lease.check()).toThrow("The content scope is closed or cancelled.");
  expect(getEventListeners(caller.signal, "abort")).toHaveLength(0);
});
