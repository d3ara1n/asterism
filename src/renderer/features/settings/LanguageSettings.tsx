import { useI18n } from "@asterism/sdk/renderer";
import { useEffect, useState } from "react";

import type { LanguageState } from "../../../shared/language";
import { settingsMessages } from "../../messages/settings";
import { Alert, AlertDescription } from "@asterism/ui/ui/alert";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@asterism/ui/ui/select";
import { Section, Row } from "./layout";

export function LanguageSettings() {
  const i18n = useI18n();
  const [state, setState] = useState<LanguageState | null>(null);
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const stop = window.host.language.onChanged(value => { if (active) setState(value); });
    void window.host.language.get().then(value => { if (active) setState(value); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; stop(); };
  }, []);
  return <Section title={i18n.text(settingsMessages.languageTitle)}>
    <Row label={i18n.text(settingsMessages.languageLabel)} hint={i18n.text(settingsMessages.languageSummary)}>
      <Select value={state?.preference ?? "system"} disabled={!state || busy} onValueChange={preference => {
        setBusy(true); setFailed(false);
        void window.host.language.set(preference).then(setState).catch(() => setFailed(true)).finally(() => setBusy(false));
      }}>
        <SelectTrigger className="w-40" aria-label={i18n.text(settingsMessages.languageLabel)}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="system">{i18n.text(settingsMessages.languageSystem)}</SelectItem>
          <SelectItem value="en">English</SelectItem><SelectItem value="zh-Hans">简体中文</SelectItem>
          {state && !["system", "en", "zh-Hans"].includes(state.preference) && <SelectItem value={state.preference}>{state.preference}</SelectItem>}
        </SelectContent>
      </Select>
    </Row>
    {failed && <Alert variant="destructive"><AlertDescription>{i18n.text(settingsMessages.languageSaveFailed)}</AlertDescription></Alert>}
  </Section>;
}
