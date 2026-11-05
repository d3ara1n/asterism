import { describe, expect, it } from "vitest";
import { ChannelClient } from "../../../src/shared/channel-client.ts";
import type { ChannelControl, ChannelFrame } from "../../../src/shared/connection.ts";
import { createPeekClient } from "./peek-renderer.ts";
import type { PeekResult } from "./peek.ts";

const target = { sessionId: "test", id: "agent", kind: "asterism.builtin/agent" };
const progress: PeekResult = {
  snapshot: { nodeId: "saved", capturedAt: "2026-11-05T00:00:00Z", records: 1 },
  phase: "writing", report: "Received explanation", round: 1, requests: [], queries: [],
};

describe("Peek renderer transport", () => {
  it("Rejects a failed initial send without leaving an unhandled channel completion", async () => {
    const channels = new ChannelClient({ onFrame() { return () => {}; }, send() { throw new Error("Disconnected"); } });
    const client = createPeekClient({ openChannel: contract => channels.open(contract, target) });
    await expect(client.run({ question: "Explain" }, { signal: new AbortController().signal }))
      .rejects.toThrow("The channel is closed.");
  });

  it("Preserves received progress in the cancelled result and releases the backend channel", async () => {
    let deliver!: (frame: ChannelFrame) => void;
    const sent: ChannelControl[] = [];
    const controller = new AbortController();
    const channels = new ChannelClient({
      onFrame(listener) { deliver = listener; return () => {}; },
      send(frame) {
        sent.push(frame);
        if (frame.type === "message") deliver({ type: "message", id: frame.id, data: { type: "progress", data: progress } });
      },
    });
    const client = createPeekClient({ openChannel: contract => channels.open(contract, target) });
    const result = await client.run({ question: "Explain" }, { signal: controller.signal, onProgress() { controller.abort(); } });
    expect(result).toMatchObject({ kind: "cancelled", data: { report: "Received explanation" } });
    expect(sent.at(-1)).toMatchObject({ type: "close" });
  });
});
