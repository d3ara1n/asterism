import { useEffect, useState } from "react";
import type { UiText, Json } from "@atelier/sdk/contracts";
import { errorDisplay } from "../../../shared/error-display.ts";
import { configurationLabel } from "../../../shared/configuration-fields";
import type { PluginConfiguration, PluginConfigurationBridge } from "../../../shared/plugin-configuration";
import { pluginConfigurationMessages } from "../../messages/plugin-configuration";
import { useI18n } from "../../shared/i18n";
import { ConfigurationValue } from "../../shared/ConfigurationValue";
import { FieldSet, FieldGroup } from "../../shared/ui/field";
import { Button } from "../../shared/ui/button";
import { Alert, AlertDescription } from "../../shared/ui/alert";
import { Spinner } from "../../shared/ui/spinner";
import { Section } from "../settings/layout";

function ConfigurationForm({ settings, execute, onSaved }: {
  settings: PluginConfiguration; execute: PluginConfigurationBridge["execute"]; onSaved(values: PluginConfiguration[]): void;
}) {
  const i18n = useI18n();
  const declaredTitle = settings.presentation?.fields[""]?.title;
  const title = declaredTitle !== undefined ? i18n.text(declaredTitle) : configurationLabel(settings.schema, settings.id);
  const [baseline, setBaseline] = useState(settings);
  const [draft, setDraft] = useState<Json | undefined>(() => structuredClone(settings.value));
  const [reset, setReset] = useState(false);
  const [edited, setEdited] = useState(false);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiText | null>(null);
  const dirty = edited || reset || JSON.stringify(draft) !== JSON.stringify(baseline.value);
  useEffect(() => {
    if (dirty) return;
    setBaseline(settings); setDraft(structuredClone(settings.value)); setVersion(value => value + 1);
  }, [settings, dirty]);
  const save = async () => {
    if (busy || !dirty || draft === undefined) return;
    setBusy(true); setError(null);
    try {
      const result = await execute(reset
        ? { type: "reset", id: settings.id } : { type: "save", id: settings.id, value: draft });
      if (!result.ok) { setError(errorDisplay(result.error)); return; }
      const saved = result.configurations.find(value => value.id === settings.id);
      if (!saved) { setError(pluginConfigurationMessages.unavailable); return; }
      setBaseline(saved); setDraft(structuredClone(saved.value)); setReset(false); setEdited(false); setVersion(value => value + 1);
      onSaved(result.configurations);
    } catch { setError(pluginConfigurationMessages.saveFailed); }
    finally { setBusy(false); }
  };
  return <Section title={title}>
    <form aria-label={title} onSubmit={event => { event.preventDefault(); void save(); }}>
      <FieldSet disabled={busy}>
        {baseline.status === "invalid" && <Alert><AlertDescription>{i18n.formatMessage(pluginConfigurationMessages.readFailed)}</AlertDescription></Alert>}
        {error && <Alert variant="destructive"><AlertDescription>{i18n.text(error)}</AlertDescription></Alert>}
        <FieldGroup><ConfigurationValue key={version} schema={settings.schema} value={draft} label={title} layout="settings"
          presentation={settings.presentation}
          onChange={value => { setDraft(value); setReset(false); setEdited(true); setError(null); }} /></FieldGroup>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" size="sm" variant="outline" className="mr-auto" onClick={() => {
            setDraft(structuredClone(settings.defaults)); setReset(true); setError(null); setVersion(value => value + 1);
          }}>{i18n.formatMessage(pluginConfigurationMessages.restoreDefaults)}</Button>
          <Button type="button" size="sm" variant="ghost" disabled={!dirty && !error} onClick={() => {
            setDraft(structuredClone(settings.value)); setBaseline(settings); setReset(false); setEdited(false); setError(null); setVersion(value => value + 1);
          }}>{i18n.formatMessage(pluginConfigurationMessages.discardChanges)}</Button>
          <Button type="submit" size="sm" disabled={!dirty || draft === undefined}>{busy && <Spinner data-icon="inline-start" />}{i18n.formatMessage(pluginConfigurationMessages.save)}</Button>
        </div>
      </FieldSet>
    </form>
  </Section>;
}

export function PluginConfigurations({ values, execute, onSaved }: {
  values: PluginConfiguration[]; execute: PluginConfigurationBridge["execute"]; onSaved(values: PluginConfiguration[]): void;
}) {
  return <div className="flex flex-col">{values.map(settings => <ConfigurationForm key={settings.id} settings={settings} execute={execute} onSaved={onSaved} />)}</div>;
}
