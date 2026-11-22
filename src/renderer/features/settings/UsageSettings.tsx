import { useI18n } from "@asterism-app/sdk/renderer";
import { ItemGroup } from "@asterism-app/ui/ui/item";
import { NumberInput } from "@asterism-app/ui/ui/number-input";
import { settingsMessages } from "../../messages/settings";
import { useConfigurationAction, useSettingsConfiguration } from "../configuration/state";
import { ConfigurationActionError, ReadStatus } from "../configuration/forms";
import { Section, Row } from "@asterism-app/ui/settings-layout";

/** Usage statistics keep every record; the monthly budget only sets the pace shown against this month's spending. */
export function UsageSettings() {
  const i18n = useI18n();
  const { snapshot, readError, load } = useSettingsConfiguration();
  const { run, busy, error } = useConfigurationAction("inline");
  return <Section title={i18n.text(settingsMessages.usageTitle)}>
    <ReadStatus loaded={!!snapshot} error={readError} onRetry={() => void load()} />
    <ItemGroup className="surface">
      <Row label={i18n.text(settingsMessages.usageBudget)} hint={i18n.text(settingsMessages.usageBudgetHint)}>
        <NumberInput value={snapshot?.usageBudget ?? null} defaultValue={null} readOnly={!snapshot || busy} min={1} max={1_000_000} step={10} precision={2}
          unit="USD" locale={i18n.locale} emptyLabel={i18n.text(settingsMessages.usageBudgetNone)}
          label={i18n.text(settingsMessages.usageBudget)} resetLabel={i18n.text(settingsMessages.usageBudgetReset)}
          onValueChange={value => { void run({ type: "usageBudget.set", value }); }} />
      </Row>
    </ItemGroup>
    <ConfigurationActionError error={error} />
  </Section>;
}
