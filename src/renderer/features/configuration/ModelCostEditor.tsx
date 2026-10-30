import { useId, useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { emptyModelRates, type ModelCost, type ModelRates, type ModalityRates, type UnitPrice } from "@asterism-app/sdk/contracts";
import { modelCostMessages as messages } from "../../messages/model-cost";
import { useI18n } from "../../shared/i18n";
import { Button } from "@asterism-app/ui/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@asterism-app/ui/ui/collapsible";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@asterism-app/ui/ui/field";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { Input } from "@asterism-app/ui/ui/input";
import { ChoiceField, EditorSection, NumberField } from "./forms";

const unitLabels = { token: messages.tokenUnit, image: messages.imageUnit, second: messages.secondUnit };
const modalityUnits: Record<keyof ModelRates, readonly UnitPrice["unit"][]> = {
  text: ["token"],
  image: ["token", "image"],
  audio: ["token", "second"],
  video: ["token", "second"],
};

function Price({ modality, item, value, onChange }: {
  modality: keyof ModelRates; item: keyof ModalityRates; value: UnitPrice | null; onChange: (value: UnitPrice | null) => void;
}) {
  const i18n = useI18n();
  const unitId = useId();
  // Unit and quantity can be chosen before an amount; a blank amount remains unknown.
  const [draftBasis, setDraftBasis] = useState<Pick<UnitPrice, "unit" | "per">>({ unit: "token", per: 1_000_000 });
  const unit = modality === "text" ? "token" : value?.unit ?? draftBasis.unit;
  const per = value?.per ?? draftBasis.per;
  const updateBasis = (basis: Pick<UnitPrice, "unit" | "per">) => {
    setDraftBasis(basis);
    if (value) onChange({ ...value, ...basis });
  };
  return <div className="grid grid-cols-3 items-end gap-3">
    <NumberField label={i18n.text(messages[item])} value={value?.amount ?? null} placeholder={i18n.text(messages.unknown)}
      onChange={amount => {
        setDraftBasis({ unit, per });
        onChange(amount === null ? null : { amount, unit, per });
      }} />
    <NumberField label={i18n.text(messages.per)} value={per} min={Number.MIN_VALUE}
      onChange={next => updateBasis({ unit, per: next ?? 0 })} />
    {modality === "text"
      ? <Field><FieldLabel htmlFor={unitId}>{i18n.text(messages.unit)}</FieldLabel>
          <Input id={unitId} value={i18n.text(messages.tokenUnit)} readOnly />
        </Field>
      : <ChoiceField label={i18n.text(messages.unit)} value={unit}
        options={modalityUnits[modality].map(unit => ({ value: unit, label: i18n.text(unitLabels[unit]) }))}
        onChange={selected => {
          const next = modalityUnits[modality].find(unit => unit === selected);
          if (next) updateBasis({ unit: next, per: next === "token" ? 1_000_000 : 1 });
        }} />}
  </div>;
}
function Rates({ value, onChange }: { value: ModelRates; onChange: (value: ModelRates) => void }) {
  const i18n = useI18n();
  return <div className="flex flex-col gap-3">{(Object.keys(value) as (keyof ModelRates)[]).map(modality =>
    <Collapsible key={modality} className="flex flex-col gap-3"
      defaultOpen={modality === "text" || Object.values(value[modality]).some(price => price !== null)}>
      <h4><CollapsibleTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="group/modality -ml-2">
          <ChevronDown className="transition-transform group-data-[state=closed]/modality:-rotate-90" />
          <span className="type-label">{i18n.text(messages[modality])}</span>
        </Button>
      </CollapsibleTrigger></h4>
      <CollapsibleContent className="pl-4"><FieldGroup className="gap-3">
        {(Object.keys(value[modality]) as (keyof ModalityRates)[]).map(item => <Price key={item} modality={modality} item={item} value={value[modality][item]}
          onChange={price => onChange({ ...value, [modality]: { ...value[modality], [item]: price } })} />)}
      </FieldGroup></CollapsibleContent>
    </Collapsible>)}</div>;
}

export function ModelCostEditor({ value, onChange }: { value: ModelCost | null; onChange: (value: ModelCost | null) => void }) {
  const i18n = useI18n();
  const cost = value ?? { currency: "USD", rates: emptyModelRates(), tiers: [] };
  const updateTier = (index: number, patch: Partial<ModelCost["tiers"][number]>) =>
    onChange({ ...cost, tiers: cost.tiers.map((tier, position) => position === index ? { ...tier, ...patch } : tier) });
  return <EditorSection collapsible title={i18n.text(messages.title)} hint={i18n.text(messages.hint)}
    action={value && <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)}>{i18n.text(messages.clear)}</Button>}>
    <FieldSet>
      <FieldLegend variant="label">{i18n.text(messages.base)}</FieldLegend>
      <Rates value={cost.rates} onChange={rates => onChange({ ...cost, rates })} />
    </FieldSet>
    <FieldSet>
      <FieldLegend variant="label">{i18n.text(messages.tiers)}</FieldLegend>
      <FieldDescription>{i18n.text(messages.tiersHint)}</FieldDescription>
      {cost.tiers.map((tier, index) => {
        const nextThreshold = cost.tiers[index + 1]?.fromInputTokens;
        return <div key={index} className="surface flex flex-col gap-3 p-4">
          <div className="flex items-end gap-3">
            <div className="flex-1"><NumberField label={i18n.text(messages.threshold)} value={tier.fromInputTokens}
              min={(cost.tiers[index - 1]?.fromInputTokens ?? -1) + 1}
              max={nextThreshold === undefined ? Number.MAX_SAFE_INTEGER : nextThreshold - 1} integer
              onChange={next => updateTier(index, { fromInputTokens: next ?? 0 })} /></div>
            <IconButton type="button" label={i18n.formatMessage(messages.removeTier, { number: index + 1 })}
              onClick={() => onChange({ ...cost, tiers: cost.tiers.filter((_, position) => position !== index) })}><Trash2 /></IconButton>
          </div>
          <Rates value={tier.rates} onChange={rates => updateTier(index, { rates })} />
        </div>;
      })}
      <Button type="button" size="sm" variant="outline" className="self-start"
        onClick={() => onChange({ ...cost, tiers: [...cost.tiers, { fromInputTokens: (cost.tiers.at(-1)?.fromInputTokens ?? 0) + 200_000, rates: emptyModelRates() }] })}>
        <Plus />{i18n.text(messages.addTier)}
      </Button>
    </FieldSet>
  </EditorSection>;
}
