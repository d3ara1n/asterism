import { ScanSearch } from "lucide-react";
import { useI18n, useRendererObject } from "@asterism-app/sdk/renderer";
import { createPeekClient } from "@asterism-app/builtin-api/renderer";
import { peekMessages } from "../../messages/peek";
import type { CommandContribution, CommandHost } from "../command/CommandPalette";
import { createPeekConversation } from "./conversation";
import { PeekPanel } from "./PeekPanel";

/** Temporary exchanges are retained per Agent; the panel stops an active investigation when it closes. */
export function usePeekCommands(host: CommandHost): CommandContribution {
  const i18n = useI18n();
  const object = useRendererObject();
  const conversation = object.retained.get("asterism.builtin/agent.peek",
    () => createPeekConversation(createPeekClient(object)), value => value.stop());
  return {
    groups: [{
      id: "peek", heading: i18n.text(peekMessages.title),
      entries: [{
        id: "peek/explain", label: i18n.text(peekMessages.explain), icon: <ScanSearch />,
        disabled: !object.view.ready, onSelect: () => host.openPanel("peek"),
      }],
    }],
    panels: {
      peek: () => <PeekPanel conversation={conversation} ready={object.view.ready} onClose={host.close} />,
    },
  };
}
