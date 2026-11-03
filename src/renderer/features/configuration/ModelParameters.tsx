import { useState } from "react";
import type { UiMessage } from "@asterism-app/sdk/contracts";
import { Check, Download } from "lucide-react";
import type { ModelParameterField, ModelParameters, ModelParameterUpdate } from "../../../shared/configuration";
import { modelCatalogMessages as messages } from "../../../shared/model-catalog-messages";
import { parameterModelId } from "../../../shared/model-catalog-id";
import { providersMessages } from "../../messages/providers";
import { modelCostMessages } from "../../messages/model-cost";
import { useI18n } from "../../shared/i18n";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { Badge } from "@asterism-app/ui/ui/badge";
import { Button } from "@asterism-app/ui/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemFooter, ItemTitle } from "@asterism-app/ui/ui/item";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { useConfigurationAction } from "./state";

const fieldLabels: Record<ModelParameterField, UiMessage> = {
  contextWindow: providersMessages.contextWindow, maxOutputTokens: providersMessages.maximumOutputTokens,
  reasoning: providersMessages.reasoning, tools: providersMessages.toolCalls, thinkingLevels: providersMessages.availableThinkingLevels,
  cost: modelCostMessages.title,
};
const modalityLabels = {
  text: modelCostMessages.text, image: modelCostMessages.image, audio: modelCostMessages.audio,
  video: modelCostMessages.video, pdf: messages.pdf,
};

/** The applied catalog model: identity, notable facts, and fields left unchanged because the catalog lacks them. */
function CatalogModelCard({ report: { model, parameters, unfilled } }: { report: ModelParameterUpdate }) {
  const i18n = useI18n();
  const tokens = (count: number) => i18n.formatNumber(count, { notation: "compact", maximumFractionDigits: 1 });
  const facts = [
    parameters.contextWindow && i18n.formatMessage(messages.context, { count: tokens(parameters.contextWindow) }),
    parameters.generation.maxOutputTokens && i18n.formatMessage(messages.output, { count: tokens(parameters.generation.maxOutputTokens) }),
    parameters.capabilities.reasoning && i18n.text(providersMessages.reasoning),
    parameters.capabilities.tools && i18n.text(providersMessages.toolCalls),
    model.inputModalities.length > 1 && model.inputModalities.map(modality => i18n.text(modalityLabels[modality])).join(" · "),
    model.openWeights && i18n.text(messages.openWeights),
  ].filter(fact => typeof fact === "string");
  return <Item variant="outline" size="sm" role="status" className="surface">
    <ItemContent className="min-w-0 gap-0.5">
      <ItemTitle>{model.name}</ItemTitle>
      <ItemDescription className="truncate font-mono text-xs">{model.id}</ItemDescription>
    </ItemContent>
    <ItemActions>
      <Badge variant="success"><Check aria-hidden="true" />{i18n.text(messages.applied)}</Badge>
    </ItemActions>
    {(facts.length > 0 || model.releaseDate) && <ItemFooter className="flex-wrap justify-start">
      {facts.map(fact => <Badge key={fact} variant="secondary" className="font-normal">{fact}</Badge>)}
      {model.releaseDate && <span className="type-caption">{i18n.formatMessage(messages.released, { date: model.releaseDate })}</span>}
    </ItemFooter>}
    {unfilled.length > 0 && <ItemFooter className="flex-wrap justify-start">
      <span className="type-caption">{i18n.text(messages.missing)}</span>
      {unfilled.map(field => <Badge key={field} variant="outline" className="border-warning/50 font-normal text-warning">
        {i18n.text(fieldLabels[field])}</Badge>)}
    </ItemFooter>}
  </Item>;
}

/** Parameter fetching and result display in model settings; subsequent configuration reads do not clear failures. */
export function useModelParameters(modelId: string, disabled: boolean, onFetched: (parameters: ModelParameters) => void) {
  const i18n = useI18n();
  const { run, busy: pending, error } = useConfigurationAction("inline");
  const [report, setReport] = useState<ModelParameterUpdate | null>(null);
  const lookupId = parameterModelId(modelId.trim());
  const fetchParameters = async () => {
    if (!lookupId || pending || disabled) return;
    setReport(null);
    const response = await run({ type: "model.parameters", modelId });
    if (!response?.parameterUpdate) return;
    setReport(response.parameterUpdate);
    onFetched(response.parameterUpdate.parameters);
  };
  return {
    pending,
    hint: lookupId ? i18n.formatMessage(messages.lookupHint, { modelId: lookupId }) : undefined,
    action: <Button type="button" size="sm" variant="outline" disabled={!lookupId || disabled || pending}
      title={i18n.text(messages.fetchTitle)} onClick={() => void fetchParameters()}>
      {pending ? <Spinner data-icon="inline-start" /> : <Download data-icon="inline-start" />}
      {i18n.text(pending ? messages.fetching : messages.fetch)}
    </Button>,
    feedback: error
      ? <Alert role="alert" variant="destructive"><AlertDescription>{i18n.text(error)}</AlertDescription></Alert>
      : report && <CatalogModelCard report={report} />,
  };
}
