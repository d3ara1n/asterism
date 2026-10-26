import { useI18n } from "@asterism/sdk/renderer";
import { Switch } from "@asterism/ui/ui/switch";
import { Progress } from "@asterism/ui/ui/progress";
import { updatesMessages as messages } from "../../messages/updates";
import { useUpdates } from "../updates/state";
import { UpdateAction, UpdateError, useUpdateSummary } from "../updates/controls";
import { Section, Row } from "./layout";

export function UpdateSettings() {
  const i18n = useI18n();
  const { state, saving, set } = useUpdates();
  const summary = useUpdateSummary();
  return <Section title={i18n.text(messages.title)}>
    <Row label={state ? i18n.formatMessage(messages.version, { version: state.version }) : "…"}
      hint={summary || undefined}>
      <UpdateAction />
    </Row>
    {state?.status === "downloading" && <Progress value={state.progress} aria-label={i18n.text(messages.title)} className="my-2" />}
    <Row label={i18n.text(messages.prerelease)} hint={i18n.text(messages.prereleaseHint)}>
      <Switch aria-label={i18n.text(messages.prerelease)} checked={state?.includePrerelease ?? false}
        disabled={!state || saving} onCheckedChange={value => void set(value)} />
    </Row>
    <UpdateError />
  </Section>;
}
