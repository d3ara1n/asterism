import { z } from "zod";
import { defineEvent } from "@asterism-app/sdk/contracts";
import { builtin } from "./identity.ts";
import { SubmitAgentInput } from "./agent.ts";

/** Published by the receiving Agent after a new submission commits, including queued inputs. */
export const AgentInputAccepted = defineEvent(builtin.name("agent.input-accepted"), {
  schema: z.strictObject({
    input: SubmitAgentInput.schema,
    queued: z.boolean(),
  }),
  source: "resource",
  semantics: { kind: "occurrence" },
});

/** An execution boundary, not an immutable seal: explicit continuation can resume an interrupted turn. */
export const AgentTurnEnded = defineEvent(builtin.name("agent.turn-ended"), {
  schema: z.strictObject({
    /** The turn-opening input record, or null when execution has no recorded turn input. */
    inputId: z.string().min(1).nullable(),
    /** Last history position before any following turn's inputs were delivered. */
    position: z.strictObject({ nodeId: z.string().min(1).nullable() }),
    reason: z.enum(["completed", "failed", "cancelled", "limited"]),
    /** This execution loop stopped consuming inputs; later submissions can start another loop. */
    settled: z.boolean(),
  }),
  source: "resource",
  semantics: { kind: "occurrence" },
});
export type AgentTurnEndReason = z.infer<typeof AgentTurnEnded.schema>["reason"];
