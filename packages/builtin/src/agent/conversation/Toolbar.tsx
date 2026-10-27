import { AgentToolbarItem, useAgentModelSelection } from "@asterism-app/builtin-api/renderer";
import { AgentConfigurationPicker } from "./ConfigurationPicker";
import { ContextUsage } from "./ContextUsage";
import { useConversationInteraction } from "./interaction";

/** Built-in and third-party items share registration, read-only selection, and toolbar presentation entry points. */
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
