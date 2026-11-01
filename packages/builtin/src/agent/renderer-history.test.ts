import { describe, expect, it } from "vitest";
import { ContextSummary } from "@asterism-app/builtin-api/contracts";
import type { RendererSessionSnapshot } from "@asterism-app/sdk/renderer";
import { sessionSnapshot } from "../../../../src/plugins/records.ts";
import { nodeView } from "../../../../src/session/view.ts";
import { agentSource, event, message, node, text } from "../../../../src/session/test-nodes.ts";
import { readAgentMeasurements } from "./renderer-history.ts";

function fixture(onRead?: () => void) {
  const completion = (input: number) => ({ finishReason: "stop", rawFinishReason: null, providerResponseId: null,
    usage: { input, output: 1, total: input + 1, cacheRead: 0, cacheWrite: 0, reasoning: 0 } });
  const nodes = [
    node("old-input", null, message("a", "Old request")),
    node("old-output", "old-input", text("a", "old", 0, "Old response", { completion: completion(100) })),
    node("kept", "old-output", message("a", "Current request")),
    node("latest", "kept", text("a", "new", 0, "Current response", { completion: completion(200) })),
    node("summary", "latest", event(ContextSummary.id, { summary: "Earlier work", keptFrom: "kept", model: "p/m",
      tokensBefore: 1000, completion: completion(10) }, { source: agentSource("a") })),
    node("other", "summary", text("b", "other", 0, "Other response", { completion: completion(999) })),
  ];
  const fixed = sessionSnapshot(nodeView("s", "", nodes, "other")), read: string[] = [];
  const remote: RendererSessionSnapshot = {
    ...fixed,
    records: {
      index: fixed.records.index,
      async all(query) {
        const records = fixed.records.all(query);
        read.push(...records.map(record => record.id));
        onRead?.();
        return records;
      },
      async query(contract, query) { return fixed.records.query(contract, query); },
      async first(contract, query) { return fixed.records.first(contract, query); },
      async last(contract, query) { return fixed.records.last(contract, query); },
    },
    resources: {
      async all() { return fixed.resources.all(); },
      async linkedTo(ref) { return fixed.resources.linkedTo(ref); },
      async get(contract, id) { return fixed.resources.get(contract, id); },
    },
  };
  return { remote, read };
}

describe("Agent measurement reads", () => {
  // A permanently mounted usage indicator must not turn a paged conversation into a full-history reader.
  it("reads the latest own measurement and summary without materializing old or unrelated conversation bodies", async () => {
    const { remote, read } = fixture();
    expect((await readAgentMeasurements(remote, "a")).usage).toMatchObject({ input: 200, compressedAfter: true });
    expect(read.sort()).toEqual(["latest", "summary"]);
  });

  // Cancellation after one remote read ends the whole observation before the next dependent query is issued.
  it("stops a cancelled observation between dependent history reads", async () => {
    const controller = new AbortController();
    const { remote, read } = fixture(() => controller.abort(new Error("View closed")));
    await expect(readAgentMeasurements(remote, "a", controller.signal)).rejects.toThrow("View closed");
    expect(read).toEqual(["summary"]);
  });
});
