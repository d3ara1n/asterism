import { recordRenderer, toolRenderer, useI18n, type RendererModule, type ToolRenderProps } from "@asterism/sdk/renderer";
import { withValues } from "@asterism/sdk/contracts";
import { PenLine, TextCursorInput } from "lucide-react";
import { ToolHeader } from "@asterism/ui/tool-header";

import { recordMessages } from "../messages/records";
import { SessionNamed } from "@asterism/builtin-api/contracts";
import { namingMessages } from "../messages/naming";
import { inputText } from "../shared/tool-preview";
import { SessionNameResult, SessionRenameResult } from "./contract";

type Props = ToolRenderProps<{ title: string }>;

function NameHeader({ result }: Props) {
  return <ToolHeader label={useI18n().text(namingMessages.name)} subject={result?.data?.title} />;
}
function RenameHeader({ args, result }: Props) {
  return <ToolHeader label={useI18n().text(namingMessages.rename)}
    subject={result?.data?.title ?? inputText(args, "title")} />;
}

const nameView = { headerRenderer: NameHeader };
const renameView = { headerRenderer: RenameHeader };

export default {
  resources: [], cards: [],
  tools: [
    toolRenderer(SessionNameResult, {
      label: namingMessages.name, icon: <TextCursorInput className="size-3.5" />,
      input: nameView, execution: nameView, result: nameView,
    }),
    toolRenderer(SessionRenameResult, {
      label: namingMessages.rename, icon: <PenLine className="size-3.5" />,
      input: renameView, execution: renameView, result: renameView,
    }),
  ],
  records: [recordRenderer(SessionNamed, { icon: <PenLine className="size-4" />,
    label: data => withValues(recordMessages.recordSessionNamed, { title: data.title }) })],
} satisfies RendererModule;
