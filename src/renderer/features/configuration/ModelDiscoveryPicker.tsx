import { useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import type { ModelDiscovery, Provider } from "../../../shared/configuration";
import { providersMessages as messages } from "../../messages/providers";
import { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/button";
import { Badge } from "../../shared/ui/badge";
import { Checkbox } from "../../shared/ui/checkbox";
import { Field, FieldLabel } from "../../shared/ui/field";
import { Input } from "../../shared/ui/input";
import { Spinner } from "../../shared/ui/spinner";
import { Alert, AlertDescription } from "../../shared/ui/alert";
import { toast } from "../../shared/toast";
import { IslandPanel } from "../../shared/weave/IslandPanel";
import { ConfigurationStatus } from "./forms";
import { useSettingsConfiguration } from "./state";

const errors = {
  configuration: messages.invalidSettings, credential: messages.saveApiKey, authentication: messages.keyRejected,
  unsupported: messages.discoveryUnsupported, rate_limit: messages.rateLimited, network: messages.networkUnavailable,
  timeout: messages.timeout, protocol: messages.unexpectedResponse, server: messages.serverError,
  cancelled: messages.discoveryCancelled,
};

export function ModelDiscoveryPicker({ providerId }: { providerId: string }) {
  const { snapshot } = useSettingsConfiguration();
  const provider = snapshot?.providers.find(provider => provider.id === providerId);
  const discovery = snapshot?.discoveries.find(discovery => discovery.providerId === providerId);
  return <DiscoveryContent key={discovery?.id ?? "empty"} provider={provider} discovery={discovery} />;
}

function DiscoveryContent({ provider, discovery }: { provider: Provider | undefined; discovery: ModelDiscovery | undefined }) {
  const i18n = useI18n();
  const { snapshot, run, busy } = useSettingsConfiguration();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const running = discovery?.state === "running";
  const existing = new Set(snapshot?.models.filter(model => model.providerId === provider?.id).map(model => model.modelId));
  const selectedIds = [...selected].filter(id => !existing.has(id));
  const q = query.trim().toLowerCase();
  const matches = discovery?.models.filter(model => `${model.modelId} ${model.name}`.toLowerCase().includes(q)) ?? [];
  const add = async () => {
    if (!discovery || discovery.state !== "succeeded") return;
    const result = await run({ type: "discovery.add", id: discovery.id, modelIds: selectedIds });
    if (result.ok) { setSelected(new Set()); toast.success(i18n.formatMessage(messages.modelsAdded, { count: selectedIds.length })); }
  };
  return <IslandPanel title={i18n.text(messages.fetchModels)} description={provider?.name}
    action={<>
      <Button size="sm" variant="outline" disabled={busy || !provider}
        onClick={() => { if (provider) void run(running ? { type: "discovery.cancel", id: discovery.id } : { type: "discovery.start", providerId: provider.id }); }}>
        {running ? <><Spinner data-icon="inline-start" />{i18n.text(messages.cancelTestRequest)}</> : <><RefreshCw data-icon="inline-start" />{i18n.text(messages.refreshModels)}</>}
      </Button>
      {discovery?.state === "succeeded" && <Button size="sm" disabled={busy || !selectedIds.length} onClick={() => void add()}>
        <Download />{i18n.formatMessage(messages.addSelectedModels, { count: selectedIds.length })}
      </Button>}
    </>}>
    <ConfigurationStatus />
    <p className="type-caption mb-4">{i18n.text(messages.discoveryHint)}</p>
    {running && <p role="status" className="type-caption flex items-center gap-2"><Spinner aria-hidden="true" />{i18n.text(messages.fetchingModels)}</p>}
    {discovery?.error && <Alert variant="destructive"><AlertDescription>{i18n.text(errors[discovery.error])}</AlertDescription></Alert>}
    {!discovery && <p role="status" className="type-caption">{i18n.text(messages.discoveryChanged)}</p>}
    {discovery?.state === "succeeded" && <div className="flex flex-col gap-4">
      <p className="type-caption">{i18n.text(messages.discoveryDefaults)}</p>
      <Input autoFocus value={query} onChange={event => setQuery(event.target.value)}
        placeholder={i18n.text(messages.searchModels)} aria-label={i18n.text(messages.searchModels)} />
      <p className="type-caption">{i18n.formatMessage(messages.discoveredCount, { count: discovery.models.length })}</p>
      <div className="surface flex flex-col gap-3 p-3">
        {matches.map((model, index) => {
          const added = existing.has(model.modelId);
          const checkboxId = `discovered-${discovery.id}-${index}`;
          return <Field key={model.modelId} orientation="horizontal">
            <Checkbox id={checkboxId} disabled={added || busy} checked={added || selected.has(model.modelId)}
              onCheckedChange={checked => setSelected(previous => {
                const next = new Set(previous);
                if (checked === true) next.add(model.modelId); else next.delete(model.modelId);
                return next;
              })} />
            <FieldLabel htmlFor={checkboxId} className="min-w-0 flex-1">
              <span className="flex min-w-0 flex-col gap-1">
                <span className="break-words">{model.name}</span>
                {model.name !== model.modelId && <span className="type-caption break-all">{model.modelId}</span>}
                {model.contextWindow !== undefined && <span className="type-caption">{i18n.formatMessage(messages.discoveredContext, { count: model.contextWindow })}</span>}
                {model.reasoning !== undefined && <span className="type-caption">{i18n.text(model.reasoning ? messages.discoveryReasoning : messages.discoveryNoReasoning)}</span>}
                {model.thinkingLevels !== undefined && <span className="type-caption">{i18n.text(messages.availableThinkingLevels)}: {model.thinkingLevels.join(", ") || "—"}</span>}
              </span>
            </FieldLabel>
            {added && <Badge variant="secondary">{i18n.text(messages.modelAlreadyAdded)}</Badge>}
          </Field>;
        })}
        {!matches.length && <p className="type-caption">{i18n.text(discovery.models.length ? messages.noMatchingModel : messages.discoveryEmpty)}</p>}
      </div>
    </div>}
  </IslandPanel>;
}
