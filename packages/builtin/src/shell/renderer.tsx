import { TerminalSquare } from "lucide-react";
import { toolRenderer, useI18n, type RendererModule, type ToolRenderProps } from "@asterism-app/sdk/renderer";
import { ToolHeader } from "@asterism-app/ui/tool-header";
import { Badge } from "@asterism-app/ui/ui/badge";
import { StatusBadge } from "@asterism-app/ui/ui/status";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@asterism-app/ui/ui/item";
import { shellMessages as messages } from "@asterism-app/ui/messages/shell";
import { resourceMessages } from "../messages/resources";
import { TOOL_BODY_LINE_LIMIT } from "../shared/tool-body";
import { ShellProfileListResult } from "./contract";
import type { ShellProfileList } from "@asterism-app/sdk/contracts";

type Props = ToolRenderProps<ShellProfileList>;

function Header({ result }: Props) {
  const i18n = useI18n();
  const data = result?.data;
  const selected = data?.selected === "auto" ? i18n.text(messages.auto)
    : data?.selected;
  return <ToolHeader label={i18n.text(messages.profiles)}
    meta={selected && `${i18n.text(messages.selected)}: ${selected}`} />;
}

function Body({ result }: Props) {
  const i18n = useI18n();
  const data = result?.data;
  if (!data) return null;
  if (!data.profiles.length) return <p className="type-caption">{i18n.text(messages.noProfiles)}</p>;
  return <div className="space-y-2"><ItemGroup>{data.profiles.slice(0, TOOL_BODY_LINE_LIMIT).map(profile => <Item key={profile.id} size="sm" className="px-0">
    <ItemContent className="min-w-0">
      <ItemTitle className="flex-wrap">
        {profile.id}
        {profile.id === data.resolvedProfile && <Badge variant="secondary">{i18n.text(messages.isDefault)}</Badge>}
        <StatusBadge tone={profile.available ? "success" : "warning"}>{i18n.text(profile.available ? messages.installed : messages.notInstalled)}</StatusBadge>
      </ItemTitle>
      <ItemDescription className="line-clamp-none break-all font-mono">
        {profile.id} · {profile.resolvedExecutable ?? profile.executable}
      </ItemDescription>
      {!!profile.args.length && <p className="type-caption break-all">
        {i18n.text(messages.args)}: <code>{JSON.stringify(profile.args)}</code>
      </p>}
      {!!profile.commandArgs.length && <p className="type-caption break-all">
        {i18n.text(messages.commandArgs)}: <code>{JSON.stringify(profile.commandArgs)}</code>
      </p>}
    </ItemContent>
  </Item>)}</ItemGroup>
    {data.profiles.length > TOOL_BODY_LINE_LIMIT && <p className="type-caption text-muted-foreground">
      {i18n.formatMessage(resourceMessages.omitted, { count: data.profiles.length - TOOL_BODY_LINE_LIMIT })}
    </p>}
  </div>;
}

const view = { headerRenderer: Header, bodyRenderer: Body };
export default {
  resources: [], cards: [],
  tools: [toolRenderer(ShellProfileListResult, {
    label: messages.profiles, icon: <TerminalSquare className="size-3.5" />,
    input: { headerRenderer: Header }, execution: view, result: view,
  })],
} satisfies RendererModule;
