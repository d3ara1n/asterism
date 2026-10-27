import { useState } from "react";
import { modelReference } from "@asterism-app/sdk/contracts";
import { useI18n } from "@asterism-app/sdk/renderer";
import type { CatalogModel, ModelConfigurationSnapshot } from "@asterism-app/builtin-api/contracts";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { Separator } from "@asterism-app/ui/ui/separator";
import { configurationMessages as messages } from "../../messages/configuration";
import { ConfigurationOptions, type ConfigurationChoice } from "./ConfigurationOptions";
import { ModelPreview } from "./ModelPreview";

type Configuration = ModelConfigurationSnapshot | null | undefined;

export function ProviderOptions({ configuration, follow, selected, initialActive, disabled, onFollow, onProvider }: {
  configuration: Configuration; follow: ConfigurationChoice; selected: string; initialActive: string; disabled: boolean;
  onFollow(): void; onProvider(id: string): void;
}) {
  const i18n = useI18n();
  const modelProviders = configuration?.modelProviders.filter(provider => provider.enabled).flatMap(provider => {
    const count = configuration.models.filter(model => model.enabled && model.providerId === provider.id).length;
    return count ? [{ value: `provider:${provider.id}`, label: provider.name, navigation: true,
      description: i18n.formatMessage(messages.modelCount, { count }), keywords: [provider.id] }] : [];
  }) ?? [];
  const options = [follow, ...modelProviders];
  return <ConfigurationOptions label={i18n.text(messages.modelProviders)} options={options} selected={selected}
    initialActive={options.some(option => option.value === initialActive) ? initialActive : follow.value}
    searchPlaceholder={i18n.text(messages.searchProviders)} disabled={disabled}
    onSelect={value => value === follow.value ? onFollow() : onProvider(value.slice("provider:".length))} />;
}

/** Browsing moves only the candidate highlight; clicking or pressing Enter commits the complete provider/model reference. */
export function ProviderModels({ configuration, providerId, selected, effectiveModel, disabled, onSelect }: {
  configuration: Configuration; providerId: string; selected: string | null; effectiveModel: CatalogModel | null; disabled: boolean;
  onSelect(value: string): void;
}) {
  const i18n = useI18n();
  const provider = configuration?.modelProviders.find(item => item.id === providerId && item.enabled);
  const models = configuration && provider ? configuration.models.filter(model => model.enabled && model.providerId === providerId) : [];
  const [active, setActive] = useState(() => {
    const initial = models.find(model => modelReference(model) === selected)
      ?? models.find(model => effectiveModel && modelReference(model) === modelReference(effectiveModel)) ?? models[0];
    return initial ? modelReference(initial) : "";
  });
  const preview = models.find(model => modelReference(model) === active) ?? null;
  const options = models.map(model => ({ value: modelReference(model), label: model.name,
    description: model.modelId, keywords: [model.modelId] }));
  return <div className="@container/model-picker flex h-96 min-h-0 flex-col">
    <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto_minmax(0,1fr)] @min-[34rem]/model-picker:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] @min-[34rem]/model-picker:grid-rows-1">
      <ConfigurationOptions label={i18n.text(commonMessages.model)} options={options} selected={selected ?? ""}
        active={active} disabled={disabled} searchPlaceholder={i18n.text(messages.searchModels)} fill
        onActiveChange={setActive} onSelect={onSelect} />
      <Separator className="@min-[34rem]/model-picker:data-[orientation=horizontal]:h-full @min-[34rem]/model-picker:data-[orientation=horizontal]:w-px" />
      <section aria-label={i18n.text(messages.modelDetails)} tabIndex={0}
        className="min-h-0 min-w-0 overflow-y-auto overscroll-contain p-3 outline-offset-[-3px]">
        {preview ? <ModelPreview model={preview} providerName={provider?.name ?? providerId} />
          : <p className="type-caption text-muted-foreground">{i18n.text(messages.noPreview)}</p>}
      </section>
    </div>
  </div>;
}
