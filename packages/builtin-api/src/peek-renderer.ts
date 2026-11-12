import type { RendererObjectContext } from "@asterism-app/sdk/renderer";
import { PeekChannel, type PeekClient, type PeekEvent, type PeekResult } from "./peek.ts";

/** Binds Peek to the displayed Agent. Stream completion carries the outcome; early iterator exit closes the channel. */
export function createPeekClient({ openChannel }: Pick<RendererObjectContext, "openChannel">): PeekClient {
  const stream: PeekClient["stream"] = async function* (input, { signal }) {
    signal.throwIfAborted();
    const channel = openChannel(PeekChannel);
    const abort = () => channel.close();
    signal.addEventListener("abort", abort, { once: true });
    let completed = false;
    let progress: PeekResult | undefined;
    const reader = new ReadableStream<PeekEvent>({
      start(output) {
        channel.onMessage(event => {
          output.enqueue(event);
          if (event.type === "result") completed = true;
          else progress = event.data;
        });
        void channel.closed.then(end => {
          if (!completed) output.enqueue({ type: "result", result: signal.aborted
            ? { kind: "cancelled", data: progress, message: "The investigation was cancelled." }
            : { kind: "failed", data: progress, error: { code: "peek_channel_closed", message: end.message ?? `Peek channel ended: ${end.reason}.` } } });
          output.close();
        });
      },
    }).getReader();
    try {
      channel.send(input);
      while (true) {
        const next = await reader.read();
        if (next.done) return;
        yield next.value;
      }
    } finally {
      signal.removeEventListener("abort", abort);
      channel.close();
      reader.releaseLock();
    }
  };
  return {
    stream,
    async run(input, { signal, onProgress }) {
      for await (const event of stream(input, { signal })) {
        if (event.type === "result") return event.result;
        onProgress?.(event.data);
      }
      throw new Error("Peek ended without a result.");
    },
  };
}
