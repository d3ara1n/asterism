import { Shrink } from "lucide-react";
import { toast } from "sonner";
import { useI18n, useRendererObject } from "@asterism-app/sdk/renderer";
import { useSettingsAction } from "@asterism-app/ui/use-settings-action";
import { commandMessages } from "../../messages/command";
import { CompactAgentConversation } from "../compression-contract";
import { useConversationInteraction } from "../conversation/interaction";
import { usePeekCommand } from "../peek/commands";
import type { CommandContribution, CommandHost } from "./CommandPalette";

/** Conversation operations share one root group; Peek still owns its retained exchange and panel. */
export function useConversationCommands(host: CommandHost): CommandContribution {
  const i18n = useI18n();
  const object = useRendererObject();
  const interaction = useConversationInteraction();
  const peek = usePeekCommand(host);
  const { run, busy } = useSettingsAction(commandMessages.compactFailed, message => { toast.error(i18n.text(message)); });
  const canCompact = interaction.executionState !== "running" && interaction.writable;
  return {
    busy,
    groups: [{
      id: "conversation", heading: i18n.text(commandMessages.conversation),
      entries: [peek.entry, {
        id: "conversation/compact", label: i18n.text(commandMessages.compact), icon: <Shrink />,
        keywords: ["compact", "compress", "压缩"],
        when: canCompact, disabled: busy,
        onSelect: () => {
          if (!canCompact) return;
          void run(async () => {
            const receipt = await object.invoke(CompactAgentConversation, {});
            if (!receipt.ok) {
              if (receipt.error.code !== "nothing_to_compact") throw receipt.error;
              toast.info(i18n.text(receipt.error.display ?? receipt.error.message));
            }
          }).then(result => { if (result) host.close(); });
        },
      }],
    }],
    panels: { peek: peek.panel },
  };
}
