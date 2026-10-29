import { useState } from "react";
import { Bot, Cpu, TextSelect } from "lucide-react";
import { useI18n, useRendererConfiguration, type PluginSettingsPage } from "@asterism-app/sdk/renderer";
import { BuiltinSettings, settingsMessages as messages } from "./contract";
import { Item, ItemContent, ItemTitle, ItemActions, ItemGroup, ItemSeparator } from "@asterism-app/ui/ui/item";
import { Switch } from "@asterism-app/ui/ui/switch";
import { Button } from "@asterism-app/ui/ui/button";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { failureDisplay } from "@asterism-app/ui/error-display";
import type { UiText } from "@asterism-app/sdk/contracts";
import { RolesSettings } from "../configuration/RolesSettings";
import { AgentsSettings } from "../configuration/AgentsSettings";
import { rolesMessages } from "../messages/roles";
import { agentsMessages } from "../messages/agents";

/** Each page changes only its own configuration; services remain independent of the mounted page. */
function StreamingSettingsPage() {
  const i18n = useI18n();
  const config = useRendererConfiguration(BuiltinSettings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiText | null>(null);
  const save = async (work: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await work(); return true; }
    catch (failure) { setError(failureDisplay(failure, messages.saveFailed)); return false; }
    finally { setBusy(false); }
  };
  const reset = () => config.save({ ...config.value, autoExpand: true, autoCollapse: true });
  const row = (key: "autoExpand" | "autoCollapse", label: UiText) => <Item key={key}>
    <ItemContent><ItemTitle>{i18n.text(label)}</ItemTitle></ItemContent>
    <ItemActions><Switch checked={config.value[key]} disabled={busy || !config.ready} aria-label={i18n.text(label)}
      onCheckedChange={checked => { void save(() => config.save({ ...config.value, [key]: checked })); }} /></ItemActions>
  </Item>;
  return <div className="flex flex-col gap-6">
    <div className="flex justify-end">
      <Button variant="outline" size="sm" disabled={busy || !config.ready} onClick={() => { void save(reset); }}>{busy && <Spinner />}{i18n.text(messages.reset)}</Button>
    </div>
    {(error || config.error) && <Alert variant="destructive"><AlertDescription>{i18n.text(error ?? config.error!)}
      <Button variant="outline" size="sm" disabled={busy} onClick={() => { void save(config.refresh); }}>{i18n.text(messages.retry)}</Button>
    </AlertDescription></Alert>}
    {config.status === "invalid" && <Alert><AlertDescription>{i18n.text(messages.invalid)}</AlertDescription></Alert>}
    {!config.ready && !config.error && <p className="type-caption flex items-center gap-2"><Spinner />{i18n.text(messages.loading)}</p>}
    <ItemGroup className="surface">{row("autoExpand", messages.autoExpand)}<ItemSeparator />{row("autoCollapse", messages.autoCollapse)}</ItemGroup>
  </div>;
}
export const builtinSettingsPages: readonly PluginSettingsPage[] = [
  { id: "roles", title: rolesMessages.modelRoles, summary: rolesMessages.summary, icon: Cpu, Body: RolesSettings },
  { id: "agents", title: agentsMessages.agents, summary: agentsMessages.summary, icon: Bot, Body: AgentsSettings },
  { id: "streaming", title: messages.streaming, summary: messages.streamingSummary, icon: TextSelect, Body: StreamingSettingsPage },
];
