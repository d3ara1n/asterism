import { useI18n } from "@asterism-app/sdk/renderer";
import { Switch } from "@asterism-app/ui/ui/switch";
import { settingsMessages } from "../../messages/settings";
import { useConfigurationAction, useSettingsConfiguration } from "../configuration/state";
import { ConfigurationActionError, ReadStatus } from "../configuration/forms";
import { Section, Row } from "./layout";

export function SidebarSettings() {
  const i18n = useI18n();
  const { snapshot, readError, load } = useSettingsConfiguration();
  const { run, busy, error } = useConfigurationAction("inline");
  return <Section title={i18n.text(settingsMessages.sidebarTitle)}>
    <ReadStatus loaded={!!snapshot} error={readError} onRetry={() => void load()} />
    <Row label={i18n.text(settingsMessages.showUsage)}>
      <Switch checked={snapshot?.showUsage ?? false} disabled={!snapshot || busy}
        aria-label={i18n.text(settingsMessages.showUsage)}
        onCheckedChange={value => { void run({ type: "showUsage.set", value }); }} />
    </Row>
    <ConfigurationActionError error={error} />
  </Section>;
}
