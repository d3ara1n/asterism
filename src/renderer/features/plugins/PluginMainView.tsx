import type { PluginMainView } from "@asterism-app/sdk/renderer";
import { PageState } from "@asterism-app/ui/ui/page-state";
import { useIsPresent } from "motion/react";
import { useI18n } from "../../shared/i18n";
import { pluginsMessages } from "../../messages/plugins";
import { PluginRegion } from "./scope";

export interface RegisteredMainView extends PluginMainView {
  key: string;
  pluginId: string;
}

export function PluginMainViewContent({ view, active }: { view: RegisteredMainView; active: boolean }) {
  const i18n = useI18n();
  // The shell may still animate out, but the departed page no longer owns guards on the shared main island.
  const present = useIsPresent();
  if (!present) return null;
  return <PluginRegion pluginId={view.pluginId} page
    fallback={<PageState kind="error" title={i18n.text(pluginsMessages.mainViewFailed)} className="h-full" />}>
    <view.Body active={active} />
  </PluginRegion>;
}
