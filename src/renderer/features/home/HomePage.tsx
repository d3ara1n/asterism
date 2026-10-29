import { useState } from "react";
import type { UiText } from "@asterism-app/sdk/contracts";
import { appMessages } from "../../messages/app";
import { homeMessages } from "../../messages/home";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { useI18n } from "../../shared/i18n";
import { BrandMark } from "@asterism-app/ui/ui/brand-mark";
import { Button } from "@asterism-app/ui/ui/button";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { useConfiguration } from "../configuration/state";
import { usePluginSettingsRegistry } from "../../modules/settings";
import { PluginRegion } from "../plugins/scope";
import { resolveSessionEntry, sessionEntryKey } from "./entries";
import type { TemplateSummary } from "../../../shared/templates";
import { TemplateCards } from "../templates/TemplateCards";

/** Home owns entry selection and templates; the selected plugin supplies its entire starting interaction. */
export function HomePage({ active, onSettings, ready, onCreated, templates, onTemplateStart, onTemplatesChanged }: {
  active: boolean; onSettings(): void; ready: boolean; onCreated(sessionId: string): void;
  templates: readonly TemplateSummary[]; onTemplateStart(id: string): Promise<UiText | null>; onTemplatesChanged(): void;
}) {
  const i18n = useI18n();
  const { snapshot, readError } = useConfiguration(active);
  const { sessionEntries } = usePluginSettingsRegistry();
  const [attempt, setAttempt] = useState(0);
  const entry = snapshot ? resolveSessionEntry(sessionEntries, snapshot.sessionEntry) : null;
  const Body = entry?.Body;
  return <div className="home-page"><div className="home-content">
    <div className="mx-auto w-full max-w-2xl">
      <header className="mb-8 flex flex-col items-center text-center">
        <BrandMark className="mb-4 size-12 text-primary" /><h1 className="type-page">{i18n.text(appMessages.appName)}</h1>
        <p className="type-body mt-2 text-muted-foreground">{i18n.text(homeMessages.homePrompt)}</p>
      </header>
      {entry && Body ? <PluginRegion key={`${sessionEntryKey(entry)}:${attempt}`} pluginId={entry.pluginId} page fallback={<Alert variant="destructive"><AlertDescription>
        {i18n.formatMessage(homeMessages.entryFailed, { plugin_name: i18n.text(entry.pluginName) })}<Button variant="outline" size="sm" onClick={() => setAttempt(value => value + 1)}>{i18n.text(homeMessages.retry)}</Button>
      </AlertDescription></Alert>}>
        <Body active={active} ready={ready} open={onCreated} />
      </PluginRegion> : <div className="flex flex-col items-center gap-3 text-center">
        <p role="status" className="type-body text-muted-foreground">{i18n.text(readError ?? (!snapshot ? commonMessages.loading
          : !sessionEntries.length ? homeMessages.noEntry : snapshot.sessionEntry ? homeMessages.entryUnavailable : homeMessages.chooseEntry))}</p>
        {snapshot && <Button variant="outline" onClick={onSettings}>{i18n.text(homeMessages.entrySettings)}</Button>}
      </div>}
    </div>
    <TemplateCards templates={templates} ready={ready} onStart={onTemplateStart} onChanged={onTemplatesChanged} />
  </div></div>;
}
