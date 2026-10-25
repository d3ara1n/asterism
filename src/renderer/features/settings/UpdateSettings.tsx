import { useEffect, useState } from "react";
import { useI18n } from "@atelier/sdk/renderer";
import { Button } from "@atelier/ui/ui/button";
import { Switch } from "@atelier/ui/ui/switch";
import { Progress } from "@atelier/ui/ui/progress";
import { Alert, AlertDescription } from "@atelier/ui/ui/alert";
import { updatesMessages as messages } from "../../messages/updates";
import type { UpdateState } from "../../../shared/updates";
import { Section, Row } from "./layout";

export function UpdateSettings() {
  const i18n = useI18n();
  const [state, setState] = useState<UpdateState | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    let active = true;
    const stop = window.host.updates.onChanged(value => { if (active) setState(value); });
    void window.host.updates.get().then(value => { if (active) setState(value); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; stop(); };
  }, []);
  const busy = checking || state?.status === "checking" || state?.status === "downloading";
  const status = !state ? null : !state.enabled ? messages.unavailable
    : state.status === "error" ? messages.failed : messages[state.status];
  return <Section title={i18n.text(messages.title)}>
    <Row label={state ? i18n.formatMessage(messages.version, { version: state.version }) : "…"}
      hint={status ? i18n.formatMessage(status, { version: state?.availableVersion ?? "", percent: Math.floor(state?.progress ?? 0) }) : undefined}>
      {state?.status === "ready" ? <Button size="sm" onClick={() => {
        void window.host.updates.install().catch(() => setFailed(true));
      }}>{i18n.text(messages.install)}</Button> : <Button size="sm" variant="outline" disabled={!state?.enabled || busy} onClick={() => {
        setChecking(true); setFailed(false);
        void window.host.updates.check().then(setState).catch(() => setFailed(true)).finally(() => setChecking(false));
      }}>{i18n.text(messages.check)}</Button>}
    </Row>
    {state?.status === "downloading" && <Progress value={state.progress} aria-label={i18n.text(messages.title)} className="my-2" />}
    <Row label={i18n.text(messages.prerelease)} hint={i18n.text(messages.prereleaseHint)}>
      <Switch aria-label={i18n.text(messages.prerelease)} checked={state?.includePrerelease ?? false}
        disabled={!state || saving} onCheckedChange={value => {
          setSaving(true); setFailed(false);
          void window.host.updates.set(value).then(setState).catch(() => setFailed(true)).finally(() => setSaving(false));
        }} />
    </Row>
    {(failed || state?.error) && <Alert variant="destructive"><AlertDescription>
      {i18n.text(failed ? messages.loadFailed : messages.failed)}
      {state?.error && <details className="mt-2"><summary>{i18n.text(messages.details)}</summary><pre className="mt-1 whitespace-pre-wrap break-all text-xs">{state.error}</pre></details>}
    </AlertDescription></Alert>}
  </Section>;
}
