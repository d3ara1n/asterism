import { implementChannel, implementTool, type ObjectReader } from "@asterism-app/sdk/runtime";
import { PeekChannel, peekInputSchema, peekToModel, type PeekClient, type PeekEvent } from "@asterism-app/builtin-api/contracts";
import { AgentPeek } from "./contract.ts";
import { investigateAgent, type PeekDependencies } from "./runtime.ts";

/** A bound service keeps identity; each call resolves the object and captures its current evidence. */
export function createPeekClient(deps: PeekDependencies, object: () => Parameters<typeof investigateAgent>[1], lifetime: AbortSignal): PeekClient {
  const run: PeekClient["run"] = async (input, { signal, onProgress }) =>
    investigateAgent(deps, object(), peekInputSchema.parse(input), AbortSignal.any([signal, lifetime]), onProgress ?? (() => {}));
  return {
    run,
    async *stream(input, { signal }) {
      const controller = new AbortController();
      const reader = new ReadableStream<PeekEvent>({
        start(output) {
          void run(input, { signal: AbortSignal.any([signal, controller.signal]), onProgress: data => output.enqueue({ type: "progress", data }) })
            .then(result => { output.enqueue({ type: "result", result }); output.close(); }, error => output.error(error));
        },
      }).getReader();
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) return;
          yield next.value;
        }
      } finally {
        controller.abort();
        reader.releaseLock();
      }
    },
  };
}

export function createPeekTool(peek: (target: ObjectReader["ref"]) => PeekClient) {
  return implementTool(AgentPeek, {
    call(_resource, _target, args, { object, signal, publish }) {
      return peek(object.ref).run(args, { signal, onProgress: publish });
    },
    toModel: peekToModel,
  });
}

export function createPeekChannel(peek: (target: ObjectReader["ref"]) => PeekClient) {
  return implementChannel(PeekChannel, channel => {
    let started = false;
    channel.onMessage(input => {
      if (started) return;
      started = true;
      void (async () => {
        try {
          for await (const event of peek(channel.object.ref).stream(input, { signal: channel.signal })) {
            if (!channel.signal.aborted) channel.send(event);
          }
        } catch (error) {
          if (!channel.signal.aborted) channel.send({ type: "result", result: {
            kind: "failed", error: { code: "peek_failed", message: error instanceof Error ? error.message : String(error) },
          } });
        } finally {
          channel.close();
        }
      })();
    });
  });
}
