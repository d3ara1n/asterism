import { AgentToolbarItem, useAgentModelSelection } from "@atelier/builtin-api/renderer";
import { AgentConfigurationPicker } from "./ConfigurationPicker";
import { ContextUsage } from "./ContextUsage";
import { useConversationInteraction } from "./interaction";

/** 内置项与第三方共用登记、只读选择和工具栏呈现入口。 */
export function ConfigurationToolbarItem() {
  const { selection } = useAgentModelSelection();
  const interaction = useConversationInteraction();
  if (!selection) return null;
  return <AgentToolbarItem>
    <AgentConfigurationPicker selection={selection} disabled={!interaction.configurable} onChange={interaction.configure} />
  </AgentToolbarItem>;
}

export function ContextToolbarItem() {
  const { selection } = useAgentModelSelection();
  return selection ? <AgentToolbarItem><ContextUsage /></AgentToolbarItem> : null;
}
