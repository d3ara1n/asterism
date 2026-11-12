import { z } from "zod";
import { formatModelExpression, parseModelExpression } from "@asterism-app/sdk/contracts";
import { defineTopLevelTool, type ModelServices, type ObjectReader, type ProviderUsage } from "@asterism-app/sdk/runtime";
import { Agent } from "@asterism-app/builtin-api/contracts";
import { selectionOf, type AgentSelectionService } from "../selection.ts";
import { diagnosticHistory } from "../diagnostics/history.ts";
import { diagnosticModel } from "../diagnostics/cost.ts";
import { GetAgentStateResult, type AgentRequestState } from "./contract.ts";
import { accountBalances, accountQuotas, agentContextUsage } from "./metrics.ts";

export function createAgentStateTool(deps: {
  selection: AgentSelectionService;
  currentRequest(object: ObjectReader): AgentRequestState | null;
  models: Pick<ModelServices, "list">;
  usage: Pick<ProviderUsage, "query">;
}) {
  return defineTopLevelTool({
    id: GetAgentStateResult.id, name: "get_agent_state",
    description: "Read your own Agent's effective model, thinking level, role, context capacity/use, remaining account or key balances, and quota windows.",
    guidelines: [
      "The runtime identifies the calling Agent. Non-Agent callers return invalid_argument.",
      "Model, role, and thinking use the active conversation request; outside a request they resolve from current Agent configuration. thinking=null uses the provider default, not off.",
      "context.max is the effective model's configured context window. context.used is its latest reported input token count, including cached input; unknown or superseded measurements are null.",
      "balance and quota read the effective provider's configured shared usage service, which can query the provider. Currency and monetary-symbol balances remain separate; balances counted in tokens or other units are excluded. Missing balances or quotas are null.",
      "quota lists plan or key allowances and short-term rate limits, distinguished by category, each with its remaining share and reset time. Rate limits read from response headers describe the latest model response.",
      "A usage query error returns partial with the other Agent information intact.",
    ],
    argsSchema: z.strictObject({}).describe("Empty parameter object; selects only the calling Agent."),
    resultSchema: GetAgentStateResult.schema, effect: "read", execution: "parallel",
    async execute(_args, { object, signal }) {
      signal.throwIfAborted();
      if (object.ref.kind !== Agent.kind) return { kind: "rejected", error: {
        code: "invalid_argument",
        message: `get_agent_state reads an Agent resource's state, but the current execution owner has resource kind "${object.ref.kind}". Pool-hosted subagents execute under their Subagent Pool and have no independent Agent resource to query.`,
      } };
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
      const data = { ...effective, context, balance: accountBalances(account), quota: accountQuotas(account) };
      return account.state === "error"
        ? { kind: "partial", data, message: `Account usage is unavailable (${account.error}).` }
        : { kind: "succeeded", data };
    },
  });
}
