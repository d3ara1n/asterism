import { useEffect, useState } from "react";
import type { UiText } from "@asterism-app/sdk/contracts";
import { ItemGroup, ItemSeparator } from "@asterism-app/ui/ui/item";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@asterism-app/ui/ui/select";
import { Switch } from "@asterism-app/ui/ui/switch";
import { Row, Section } from "@asterism-app/ui/settings-layout";
import { useSettingsAction } from "@asterism-app/ui/use-settings-action";
import type { LanguageState } from "../../../shared/language";
import { homeMessages } from "../../messages/home";
import { settingsMessages } from "../../messages/settings";
import { usePluginSettingsRegistry } from "../../modules/settings";
import { useI18n } from "../../shared/i18n";
import { useConfigurationAction, useSettingsConfiguration } from "../configuration/state";
import { ConfigurationActionError, ReadStatus } from "../configuration/forms";
import { resolveSessionEntry, sessionEntryKey } from "../home/entries";

/** Language preference owned by main; it reads and saves independently of the shared configuration. */
function useLanguagePreference() {
  const [state, setState] = useState<LanguageState | null>(null);
  const [readError, setReadError] = useState<UiText | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { run, busy, error } = useSettingsAction(settingsMessages.languageSaveFailed);
  useEffect(() => {
    let active = true;
    const accept = (value: LanguageState) => { if (active) { setState(value); setReadError(null); } };
    const stop = window.host.language.onChanged(accept);
    void window.host.language.get().then(accept).catch(() => { if (active) setReadError(settingsMessages.languageLoadFailed); });
    return () => { active = false; stop(); };
  }, [attempt]);
  return {
    state, readError, busy, error,
    set: (preference: string) => void run(async () => { setState(await window.host.language.set(preference)); setReadError(null); }),
    retry: () => { setReadError(null); setAttempt(value => value + 1); },
  };
}

/** Interface preferences share one group: language, the Home session entry, and sidebar usage. */
export function InterfaceSettings() {
  const i18n = useI18n();
  const language = useLanguagePreference();
  const { snapshot, readError, load } = useSettingsConfiguration();
  const { run, busy, error } = useConfigurationAction("inline");
  const { sessionEntries } = usePluginSettingsRegistry();
  const selected = snapshot ? resolveSessionEntry(sessionEntries, snapshot.sessionEntry) : null;
  const entry = selected ? sessionEntryKey(selected) : snapshot?.sessionEntry
    ? JSON.stringify([snapshot.sessionEntry.pluginId, snapshot.sessionEntry.entryId]) : "";
  const preference = language.state?.preference;
  return <Section title={i18n.text(settingsMessages.interfaceTitle)}>
    <ReadStatus loaded={!!language.state && !!snapshot} error={language.readError ?? readError} onRetry={() => {
      if (language.readError) language.retry();
      if (readError) void load();
    }} />
    <ItemGroup className="surface">
      <Row label={i18n.text(settingsMessages.languageLabel)} hint={i18n.text(settingsMessages.languageSummary)}>
        <Select value={preference ?? "system"} disabled={!language.state || language.busy} onValueChange={language.set}>
          <SelectTrigger className="w-40" aria-label={i18n.text(settingsMessages.languageLabel)}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="system">{i18n.text(settingsMessages.languageSystem)}</SelectItem>
            <SelectItem value="en">English</SelectItem><SelectItem value="zh-Hans">简体中文</SelectItem>
            {preference && !["system", "en", "zh-Hans"].includes(preference) && <SelectItem value={preference}>{preference}</SelectItem>}
          </SelectContent>
        </Select>
      </Row>
      <ItemSeparator />
      <Row label={i18n.text(homeMessages.entryTitle)} hint={i18n.text(homeMessages.entrySummary)}>
        <Select value={entry} disabled={!snapshot || busy || !sessionEntries.length} onValueChange={key => {
          const next = sessionEntries.find(item => sessionEntryKey(item) === key);
          if (next) void run({ type: "sessionEntry.set", value: { pluginId: next.pluginId, entryId: next.id } });
        }}>
          <SelectTrigger className="w-52" aria-label={i18n.text(homeMessages.entryTitle)}><SelectValue placeholder={i18n.text(homeMessages.chooseEntry)} /></SelectTrigger>
          <SelectContent><SelectGroup>
            {entry && !selected && <SelectItem value={entry} disabled>{i18n.text(homeMessages.entryUnavailable)}</SelectItem>}
            {sessionEntries.map(item => <SelectItem key={sessionEntryKey(item)} value={sessionEntryKey(item)}>{i18n.text(item.title)} · {i18n.text(item.pluginName)}</SelectItem>)}
          </SelectGroup></SelectContent>
        </Select>
      </Row>
      <ItemSeparator />
      <Row label={i18n.text(settingsMessages.showUsage)}>
        <Switch checked={snapshot?.showUsage ?? false} disabled={!snapshot || busy} aria-label={i18n.text(settingsMessages.showUsage)}
          onCheckedChange={value => { void run({ type: "showUsage.set", value }); }} />
      </Row>
    </ItemGroup>
    {!sessionEntries.length && <p className="type-caption mt-2 px-1">{i18n.text(homeMessages.noEntry)}</p>}
    <ConfigurationActionError error={language.error ?? error} />
  </Section>;
}
