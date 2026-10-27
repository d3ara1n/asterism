import { implementTool, type ObjectReader } from "@asterism/sdk/runtime";
import { AgentWait, type AgentWaitResult } from "./contract.ts";
import { projectAgentTurnState } from "../state-projection.ts";
import { agentExecutionState } from "../state.ts";

interface AgentSettling {
  running(object: ObjectReader): boolean;
  settled(object: ObjectReader, signal: AbortSignal): Promise<void>;
}

/** Waits for the agent to settle; if delivered input starts a new loop after the previous one exits, keeps waiting until execution stops or times out. */
export function createWaitTool(loop: AgentSettling) {
  return implementTool(AgentWait, {
    async call(_data, _target, args, { object, caller, signal }) {
      const started = performance.now();
      const result = (): AgentWaitResult => ({
        name: object.snapshot()?.title ?? "Agent",
        executionState: agentExecutionState(projectAgentTurnState(object.session.snapshot(), object.ref.id), loop.running(object)),
        elapsedMs: Math.round(performance.now() - started),
      });
      if (caller.ref.id === object.ref.id)
        return { kind: "failed", data: result(), error: { code: "agent_self_wait", message: "An Agent cannot wait for itself to settle." } };
      const deadline = AbortSignal.timeout(args.timeout * 1000);
      const bounded = AbortSignal.any([signal, deadline]);
      try {
        while (loop.running(object)) await loop.settled(object, bounded);
      } catch (error) {
        if (signal.aborted) throw error;
        if (!deadline.aborted) throw error;
        return { kind: "failed", data: result(), error: { code: "agent_timeout", message: "The Agent did not settle before the timeout. It continues running." } };
      }
      return { kind: "succeeded", data: result() };
    },
  });
}
