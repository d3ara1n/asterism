import { randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { restoreManagedRecord, saveManagedRecord } from "./npm-records.ts";

it("restores the locked graph only for the selected exact version and leaves downloaded files outside recovery", () => {
  const root = mkdtempSync(join(tmpdir(), "asterism-npm-record-"));
  try {
    const id = randomUUID(), original = join(root, "original"), restored = join(root, "restored");
    mkdirSync(original); mkdirSync(restored);
    writeFileSync(join(original, "package.json"), '{"dependencies":{"example":"1.0.0"}}');
    writeFileSync(join(original, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    writeFileSync(join(original, "pnpm-workspace.yaml"), "allowBuilds: {}\n");
    writeFileSync(join(original, "asterism-installation.json"), JSON.stringify({ package: { name: "example", version: "1.0.0" } }));
    writeFileSync(join(original, ".npmrc"), "secret");
    saveManagedRecord(root, id, original);
    rmSync(original, { recursive: true });
    expect(restoreManagedRecord(root, id, restored, "example", "2.0.0")).toBe(false);
    expect(existsSync(join(restored, "package.json"))).toBe(false);
    expect(restoreManagedRecord(root, id, restored, "example", "1.0.0")).toBe(true);
    expect(readFileSync(join(restored, "package.json"), "utf8")).toBe('{"dependencies":{"example":"1.0.0"}}');
    expect(readFileSync(join(restored, "pnpm-lock.yaml"), "utf8")).toBe("lockfileVersion: '9.0'\n");
    expect(existsSync(join(root, "records", id, ".npmrc"))).toBe(false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
