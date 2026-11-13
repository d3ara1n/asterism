import type { z } from "zod";
import { ScanSearch } from "lucide-react";
import { toolRenderer, useI18n, type ToolRenderProps } from "@asterism-app/sdk/renderer";
import { ToolHeader } from "@asterism-app/ui/tool-header";
import { Badge } from "@asterism-app/ui/ui/badge";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { filesystemMessages as messages } from "../messages/filesystem";
import { inputText } from "../shared/tool-preview";
import { InspectPathResult } from "./inspection-contract";
import { DirectoryListing } from "./list-view";

type Props = ToolRenderProps<z.infer<typeof InspectPathResult.schema>>;

function Header({ args, result }: Props) {
  const i18n = useI18n();
  const data = result?.data;
  const path = data?.path ?? inputText(args, "path");
  return <ToolHeader label={i18n.text(messages.inspectPath)}
    summary={path && <span className="font-mono" title={path}>{path}</span>}
    meta={data && (!data.exists ? <Badge variant="outline">{i18n.text(commonMessages.referenceMissing)}</Badge>
      : data.entries !== null ? i18n.formatMessage(messages.toolEntryCount, { count: data.entries.length, truncated: data.truncated }) : undefined)} />;
}

function Body({ result }: Props) {
  const data = result?.data;
  if (!data || data.entries === null) return null;
  return <DirectoryListing data={{ path: data.path, entries: data.entries, truncated: data.truncated }} />;
}

export const inspectPathRenderer = toolRenderer(InspectPathResult, {
  label: messages.inspectPath, icon: <ScanSearch />,
  input: { headerRenderer: Header }, execution: { headerRenderer: Header },
  result: { headerRenderer: Header, bodyRenderer: Body },
});
