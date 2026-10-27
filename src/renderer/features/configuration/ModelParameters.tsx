import { useState } from "react";
import { Download } from "lucide-react";
import { modelReference, type ProviderModel, type ModelParameterUpdate } from "../../../shared/configuration";
import { modelCatalogMessages as messages } from "../../../shared/model-catalog-messages";
import { providersMessages } from "../../messages/providers";
import { modelCostMessages } from "../../messages/model-cost";
import { useI18n } from "../../shared/i18n";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { Button } from "@asterism-app/ui/ui/button";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { useConfigurationAction } from "./state";

const fields = {
  contextWindow: providersMessages.contextWindow, maxOutputTokens: providersMessages.maximumOutputTokens,
  reasoning: providersMessages.reasoning, tools: providersMessages.toolCalls, thinkingLevels: providersMessages.availableThinkingLevels,
  cost: modelCostMessages.title,
};

/** Parameter fetching and result display in model settings; subsequent configuration reads do not clear failures. */
export function useModelParameters(model: ProviderModel | undefined, disabled: boolean, onUpdated: (model: ProviderModel) => void) {
  const i18n = useI18n();
  const { run, busy: pending, error } = useConfigurationAction("inline");
  const [report, setReport] = useState<ModelParameterUpdate | null>(null);
  const fetchParameters = async () => {
    if (!model || pending || disabled) return;
    setReport(null);
    const response = await run({ type: "model.parameters", model: modelReference(model) });
    if (!response) return;
    if (response.parameterUpdate) setReport(response.parameterUpdate);
    const updated = response.snapshot.models.find(item => modelReference(item) === modelReference(model));
    if (updated) onUpdated(updated);
  };
  return {
    pending,
    action: <Button type="button" size="sm" variant="outline" disabled={!model || disabled || pending}
      title={i18n.text(messages.hint)} onClick={() => void fetchParameters()}>
      {pending ? <Spinner data-icon="inline-start" /> : <Download data-icon="inline-start" />}
      {i18n.text(pending ? messages.fetching : messages.fetch)}
    </Button>,
    feedback: (error || report) && <Alert role={error ? "alert" : "status"} variant={error ? "destructive" : "default"}>
      <AlertDescription>
        {error ? i18n.text(error) : report && <>
          <p>{i18n.formatMessage(messages.saved, { source: report.source })}</p>
          {report.unfilled.length > 0 && <p>{i18n.formatMessage(messages.unfilled, {
            fields: report.unfilled.map(field => i18n.text(fields[field])).join(", "),
          })}</p>}
        </>}
      </AlertDescription>
    </Alert>,
  };
}
