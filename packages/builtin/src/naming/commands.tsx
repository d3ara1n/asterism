import { WandSparkles } from "lucide-react";
import { useI18n, useRendererCalls, type RendererCommand, type RendererCommandContext, type RendererCommandGroup } from "@asterism-app/sdk/renderer";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { useSettingsAction } from "@asterism-app/ui/use-settings-action";
import { namingMessages } from "../messages/naming";
import { commandMessages } from "../messages/command";
import { GenerateSessionName } from "./contract";

/** User-requested naming belongs to the session, not to an Agent card. */
function useSessionCommands(context: RendererCommandContext): readonly RendererCommand[] {
  const i18n = useI18n();
  const calls = useRendererCalls();
  const { run, busy, error } = useSettingsAction(namingMessages.failed);
  return [{
    id: "auto-rename", label: namingMessages.autoRename,
    icon: busy ? <Spinner /> : <WandSparkles />,
    when: context.session !== null,
    disabled: !context.ready || busy,
    detail: error ? <span role="alert" className="text-destructive">{i18n.text(error)}</span> : undefined,
    onAction() {
      const session = context.session;
      if (!session || !context.ready || busy) return;
      void run(() => calls.invoke(GenerateSessionName, { sessionId: session.id }, {}))
        .then(result => { if (result) context.close(); });
    },
  }];
}

export const sessionCommands: RendererCommandGroup = {
  id: "session", label: commandMessages.session, useCommands: useSessionCommands,
};
