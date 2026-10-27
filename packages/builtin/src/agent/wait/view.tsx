import { Hourglass } from "lucide-react";
import { toolRenderer, useI18n, type ToolRenderProps } from "@asterism-app/sdk/renderer";
import { ToolHeader } from "@asterism-app/ui/tool-header";
import { AgentWait, type AgentWaitResult } from "./contract";
import { waitMessages as messages } from "../../messages/wait";

type Props = ToolRenderProps<AgentWaitResult, null, { timeout: number }>;
function Header({ invocation, result, phase }: Props) {
  const i18n = useI18n();
  const data = phase === "settled" ? result.data : null;
  return <ToolHeader label={i18n.text(messages.title)} subject={invocation.resource?.title}
    meta={data ? i18n.formatMessage(messages.state, { state: data.executionState }) : undefined} />;
}
export const waitToolRenderer = toolRenderer(AgentWait, {
  label: messages.title, icon: <Hourglass className="size-3.5" />,
  input: { headerRenderer: Header }, execution: { headerRenderer: Header }, result: { headerRenderer: Header },
});
