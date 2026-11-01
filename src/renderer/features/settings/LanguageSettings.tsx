import { useI18n } from "@asterism-app/sdk/renderer";
import { useEffect, useState } from "react";

import type { LanguageState } from "../../../shared/language";
import { settingsMessages } from "../../messages/settings";
import { useSettingsAction } from "@asterism-app/ui/use-settings-action";
import type { UiText } from "@asterism-app/sdk/contracts";
import { ConfigurationActionError, ReadStatus } from "../configuration/forms";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@asterism-app/ui/ui/select";
import { Section, Row } from "./layout";

export function LanguageSettings() {
  const i18n = useI18n();
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
  return <Section title={i18n.text(settingsMessages.languageTitle)}>
    <ReadStatus loaded={!!state} error={readError} onRetry={() => { setReadError(null); setAttempt(value => value + 1); }} />
    <Row label={i18n.text(settingsMessages.languageLabel)} hint={i18n.text(settingsMessages.languageSummary)}>
      <Select value={state?.preference ?? "system"} disabled={!state || busy} onValueChange={preference => {
        void run(async () => { setState(await window.host.language.set(preference)); setReadError(null); });
      }}>
        <SelectTrigger className="w-40" aria-label={i18n.text(settingsMessages.languageLabel)}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="system">{i18n.text(settingsMessages.languageSystem)}</SelectItem>
          <SelectItem value="en">English</SelectItem><SelectItem value="zh-Hans">简体中文</SelectItem>
          {state && !["system", "en", "zh-Hans"].includes(state.preference) && <SelectItem value={state.preference}>{state.preference}</SelectItem>}
        </SelectContent>
      </Select>
    </Row>
    <ConfigurationActionError error={error} />
  </Section>;
}
