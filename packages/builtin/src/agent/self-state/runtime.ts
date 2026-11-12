import { z } from "zod";
import { formatModelExpression, parseModelExpression } from "@asterism-app/sdk/contracts";
import { defineTopLevelTool, type ModelServices, type ObjectReader, type ProviderUsage } from "@asterism-app/sdk/runtime";
import { Agent } from "@asterism-app/builtin-api/contracts";
import { selectionOf, type AgentSelectionService } from "../selection.ts";
import { diagnosticHistory } from "../diagnostics/history.ts";
import { diagnosticModel } from "../diagnostics/cost.ts";
import { GetAgentStateResult, type AgentRequestState } from "./contract.ts";
import { accountBalances, agentContextUsage } from "./metrics.ts";

export function createAgentStateTool(deps: {
  selection: AgentSelectionService;
  currentRequest(object: ObjectReader): AgentRequestState | null;
  models: Pick<ModelServices, "list">;
  usage: Pick<ProviderUsage, "query">;
}) {
  return defineTopLevelTool({
    id: GetAgentStateResult.id, name: "get_agent_state",
    description: "Read your own Agent's effective model, thinking level, role, context capacity/use, and remaining account or key balances.",
    guidelines: [
      "The runtime identifies the calling Agent. Non-Agent callers return invalid_argument.",
      "Model, role, and thinking use the active conversation request; outside a request they resolve from current Agent configuration. thinking=null uses the provider default, not off.",
      "context.max is the effective model's configured context window. context.used is its latest reported input token count, including cached input; unknown or superseded measurements are null.",
      "balance reads the effective provider's configured shared balance service and can query the provider. Currency and monetary-symbol balances remain separate; quotas and request token counts are excluded. Missing balances are null.",
      "A balance query error returns partial with the other Agent information intact.",
    ],
    argsSchema: z.strictObject({}).describe("Empty parameter object; selects only the calling Agent."),
    resultSchema: GetAgentStateResult.schema, effect: "read", execution: "parallel",
    async execute(_args, { object, signal }) {
      signal.throwIfAborted();
      if (object.ref.kind !== Agent.kind) return { kind: "rejected", error: { code: "invalid_argument", message: "get_agent_state requires an Agent caller." } };
      let effective = deps.currentRequest(object);
      if (!effective) {
        const selection = selectionOf(object).selection, target = deps.selection.target(selection);
        effective = { role: selection.agent, model: formatModelExpression(target), thinking: target.thinking ?? null };
      }
      const models = deps.models.list().map(model => ({
        providerId: model.provider, modelId: parseModelExpression(model.model)!.model, contextWindow: model.contextWindow, reference: model.model,
      }));
      const { requests } = diagnosticHistory(object.session.snapshot(), object.ref.id, "timeline");
      const context = agentContextUsage(requests, models.find(model => model.reference === effective.model)?.contextWindow ?? null,
        request => diagnosticModel(request, models)?.reference === effective.model);
      const account = await deps.usage.query(parseModelExpression(effective.model)!.provider, { signal });
      const data = { ...effective, context, balance: accountBalances(account) };
      return account.state === "error"
        ? { kind: "partial", data, message: `Account balance is unavailable (${account.error}).` }
        : { kind: "succeeded", data };
    },
  });
}
