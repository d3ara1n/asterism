import { useState } from "react";
import { Download } from "lucide-react";
import { modelReference, type ProviderModel, type ModelParameterUpdate } from "../../../shared/configuration";
import { errorDisplay } from "../../../shared/error-display";
import { modelCatalogMessages as messages } from "../../../shared/model-catalog-messages";
import type { UiText } from "@atelier/sdk/contracts";
import { providersMessages } from "../../messages/providers";
import { modelCostMessages } from "../../messages/model-cost";
import { useI18n } from "../../shared/i18n";
import { Alert, AlertDescription } from "../../shared/ui/alert";
import { Button } from "../../shared/ui/button";
import { Spinner } from "../../shared/ui/spinner";
import { useSettingsConfiguration } from "./state";

const fields = {
  contextWindow: providersMessages.contextWindow, maxOutputTokens: providersMessages.maximumOutputTokens,
  reasoning: providersMessages.reasoning, tools: providersMessages.toolCalls, thinkingLevels: providersMessages.availableThinkingLevels,
  cost: modelCostMessages.title,
};

/** 模型设置中的参数获取与结果展示；失败不被随后配置读取清掉。 */
export function useModelParameters(model: ProviderModel | undefined, disabled: boolean, onUpdated: (model: ProviderModel) => void) {
  const i18n = useI18n();
  const { run, busy } = useSettingsConfiguration();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ error: UiText } | { report: ModelParameterUpdate } | null>(null);
  const fetchParameters = async () => {
    if (!model || pending || busy || disabled) return;
    setPending(true);
    setResult(null);
    try {
      const response = await run({ type: "model.parameters", model: modelReference(model) });
      if (!response.ok) { setResult({ error: errorDisplay(response.error) }); return; }
      if (response.parameterUpdate) setResult({ report: response.parameterUpdate });
      const updated = response.snapshot.models.find(item => modelReference(item) === modelReference(model));
      if (updated) onUpdated(updated);
    } catch { setResult({ error: messages.failed }); }
    finally { setPending(false); }
  };
  return {
    pending,
    action: <Button type="button" size="sm" variant="outline" disabled={!model || disabled || busy || pending}
      title={i18n.text(messages.hint)} onClick={() => void fetchParameters()}>
      {pending ? <Spinner data-icon="inline-start" /> : <Download data-icon="inline-start" />}
      {i18n.text(pending ? messages.fetching : messages.fetch)}
    </Button>,
    feedback: result && <Alert role={"error" in result ? "alert" : "status"} variant={"error" in result ? "destructive" : "default"}>
      <AlertDescription>
        {"error" in result ? i18n.text(result.error) : <>
          <p>{i18n.formatMessage(messages.saved, { source: result.report.source })}</p>
          {result.report.unfilled.length > 0 && <p>{i18n.formatMessage(messages.unfilled, {
            fields: result.report.unfilled.map(field => i18n.text(fields[field])).join(", "),
          })}</p>}
        </>}
      </AlertDescription>
    </Alert>,
  };
}
