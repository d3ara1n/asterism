import { nanoid } from "nanoid";
import { implementTool, PluginApiError } from "@atelier/sdk/runtime";
import { SubmitAgentInput } from "@atelier/builtin-api/contracts";
import { AgentSend } from "./contract.ts";

export function createSendTool() {
  return implementTool(AgentSend, {
    async call(_data, _target, args, { object, caller, signal }) {
      const recipient = object.snapshot();
      if (!recipient) throw new PluginApiError("not_found", "The recipient Agent is unavailable.");
      await object.session.invoke(SubmitAgentInput, object.ref, {
        submissionId: nanoid(16), mode: "steer", parts: [{ kind: "text", text: args.message }],
        sender: { kind: "agent", resource: { ...caller.ref }, name: caller.title },
      }, { signal });
      return { kind: "succeeded", data: { name: recipient.title } };
    },
  });
}
