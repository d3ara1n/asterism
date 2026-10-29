import { useI18n } from "@asterism-app/sdk/renderer";
import { homeMessages } from "../../messages/home";
import { usePluginSettingsRegistry } from "../../modules/settings";
import { useConfigurationAction, useSettingsConfiguration } from "../configuration/state";
import { ConfigurationActionError, ReadStatus } from "../configuration/forms";
import { resolveSessionEntry, sessionEntryKey } from "../home/entries";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@asterism-app/ui/ui/select";
import { Section, Row } from "./layout";

export function HomeEntrySettings() {
  const i18n = useI18n();
  const { snapshot, readError, load } = useSettingsConfiguration();
  const { sessionEntries } = usePluginSettingsRegistry();
  const { run, busy, error } = useConfigurationAction("inline");
  const selected = snapshot ? resolveSessionEntry(sessionEntries, snapshot.sessionEntry) : null;
  const value = selected ? sessionEntryKey(selected) : snapshot?.sessionEntry
    ? JSON.stringify([snapshot.sessionEntry.pluginId, snapshot.sessionEntry.entryId]) : "";
  return <Section title={i18n.text(homeMessages.entryTitle)}>
    <ReadStatus loaded={!!snapshot} error={readError} onRetry={() => void load()} />
    <Row label={i18n.text(homeMessages.entryTitle)} hint={i18n.text(homeMessages.entrySummary)}>
      <Select value={value} disabled={!snapshot || busy || !sessionEntries.length} onValueChange={key => {
        const entry = sessionEntries.find(entry => sessionEntryKey(entry) === key);
        if (entry) void run({ type: "sessionEntry.set", value: { pluginId: entry.pluginId, entryId: entry.id } });
      }}>
        <SelectTrigger className="w-52" aria-label={i18n.text(homeMessages.entryTitle)}><SelectValue placeholder={i18n.text(homeMessages.chooseEntry)} /></SelectTrigger>
        <SelectContent><SelectGroup>
          {value && !selected && <SelectItem value={value} disabled>{i18n.text(homeMessages.entryUnavailable)}</SelectItem>}
          {sessionEntries.map(entry => <SelectItem key={sessionEntryKey(entry)} value={sessionEntryKey(entry)}>{i18n.text(entry.title)} · {i18n.text(entry.pluginName)}</SelectItem>)}
        </SelectGroup></SelectContent>
      </Select>
    </Row>
    {!sessionEntries.length && <p className="type-caption">{i18n.text(homeMessages.noEntry)}</p>}
    <ConfigurationActionError error={error} />
  </Section>;
}
