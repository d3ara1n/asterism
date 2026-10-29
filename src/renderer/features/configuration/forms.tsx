import type { ComponentProps } from "react";
import { Editor as SharedEditor, ReadStatus } from "@asterism-app/ui/configuration-forms";
import { IslandPanel } from "../../shared/weave/IslandPanel";
import { useSettingsConfiguration } from "./state";
export * from "@asterism-app/ui/configuration-forms";
export function Editor(props: ComponentProps<typeof SharedEditor>) { return <SharedEditor {...props} Panel={IslandPanel} />; }

/** Host adapter for the shared read status; the settings category page renders it once. */
export function ConfigurationReadStatus() {
  const { snapshot, readError, load } = useSettingsConfiguration();
  return <ReadStatus loaded={!!snapshot} error={readError} onRetry={() => void load()} />;
}
