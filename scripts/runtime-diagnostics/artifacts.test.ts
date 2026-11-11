import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { saveHeapSnapshot } from "./artifacts.ts";
import { InspectorRequests } from "./inspector.ts";

it("streams split snapshot chunks in order and publishes the completed artifact only after success", async () => {
  const directory = mkdtempSync(join(tmpdir(), "asterism-snapshot-"));
  const path = join(directory, "capture.heapsnapshot");
  const requests = new InspectorRequests(message => {
    const { id } = JSON.parse(message);
    for (const chunk of ['{"value":"汉', '字","lines":"a\\nb"}'])
      requests.receive(JSON.stringify({ method: "HeapProfiler.addHeapSnapshotChunk", params: { chunk } }));
    expect(existsSync(path)).toBe(false);
    requests.receive(JSON.stringify({ id, result: {} }));
  });
  try {
    await saveHeapSnapshot(requests, path);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ value: "汉字", lines: "a\nb" });
    expect(existsSync(`${path}.partial`)).toBe(false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

it("retains interrupted snapshot bytes as partial rather than publishing a corrupt complete snapshot", async () => {
  const directory = mkdtempSync(join(tmpdir(), "asterism-snapshot-"));
  const path = join(directory, "capture.heapsnapshot");
  const requests = new InspectorRequests(() => {
    requests.receive(JSON.stringify({ method: "HeapProfiler.addHeapSnapshotChunk", params: { chunk: '{"unfinished":' } }));
    requests.end(new Error("Target exited"));
  });
  try {
    await expect(saveHeapSnapshot(requests, path)).rejects.toThrow("Target exited");
    expect(existsSync(path)).toBe(false);
    expect(readFileSync(`${path}.partial`, "utf8")).toBe('{"unfinished":');
    expect(requests.notification).toBeUndefined();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
