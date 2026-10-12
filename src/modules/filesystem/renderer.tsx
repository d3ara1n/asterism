import { useI18n, creationEntry, cardRenderer, toolRenderer, type RendererModule } from "@atelier/sdk/renderer";
import { Folder, BookOpen, FilePenLine, FilePlus2, ListTree } from "lucide-react";

import { ToolHeader } from "../../renderer/shared/tool-header";
import { filesystemMessages } from "../messages/filesystem";
import { textMessages } from "../messages/text";
import { TextReadBody, TextChangeBody } from "../text-view";
import { CreateDirectory, DirectoryView, DirectoryList, DirectoryRead, DirectoryEdit, DirectoryWrite } from "./contract";
import { DirectoryInput } from "./creation";

const appearance = { width: 340, height: 200, minWidth: 280, minHeight: 160 };

export default {
  resources: [{ kind: "atelier.core/directory", label: filesystemMessages.directory, icon: <Folder className="size-4" />, card: appearance }],
  cards: [cardRenderer(DirectoryView, {
    ...appearance,
    Body: ({ data }) => {  return <div className="min-h-0 flex-1 select-text overflow-auto p-3">
      <p className="type-body break-all font-mono text-xs">{data.path}</p>
    </div>; },
  })],
  tools: [
    toolRenderer(DirectoryRead, {
      label: textMessages.toolTextRead, icon: <BookOpen className="size-3.5" />,
      headerRenderer: ({ target, invocation, result }) => { const i18n = useI18n(); return <ToolHeader label={i18n.formatMessage(textMessages.toolTextRead)} monospace
        subject={[invocation.resource?.title, target.path].filter(Boolean).join(" / ")}
        meta={result?.data && i18n.formatMessage(textMessages.toolTextLines, { shown: result.data.rows.length, total: result.data.totalLines })} />; },
      bodyRenderer: TextReadBody,
    }),
    toolRenderer(DirectoryEdit, {
      label: textMessages.toolTextEdit, icon: <FilePenLine className="size-3.5" />,
      headerRenderer: ({ target, invocation, result }) => { const i18n = useI18n(); return <ToolHeader label={i18n.formatMessage(textMessages.toolTextEdit)} monospace
        subject={[invocation.resource?.title, target.path].filter(Boolean).join(" / ")}
        meta={result?.data && <>+{result.data.added} −{result.data.removed}</>} />; },
      bodyRenderer: TextChangeBody,
    }),
    toolRenderer(DirectoryWrite, {
      label: textMessages.toolTextWrite, icon: <FilePlus2 className="size-3.5" />,
      headerRenderer: ({ target, invocation, result }) => { const i18n = useI18n(); return <ToolHeader label={i18n.formatMessage(textMessages.toolTextWrite)} monospace
        subject={[invocation.resource?.title, target.path].filter(Boolean).join(" / ")}
        meta={result?.data && <>+{result.data.added} −{result.data.removed}</>} />; },
      bodyRenderer: TextChangeBody,
    }),
    toolRenderer(DirectoryList, {
      label: filesystemMessages.toolDirectoryList,
      icon: <ListTree className="size-3.5" />,
      headerRenderer: ({ target, invocation, result }) => { const i18n = useI18n(); return <ToolHeader label={i18n.formatMessage(filesystemMessages.toolDirectoryList)} monospace
        subject={[invocation.resource?.title, target?.path && target.path !== "." ? target.path : null].filter(Boolean).join(" / ")}
        meta={result?.data && i18n.formatMessage(filesystemMessages.toolEntryCount, { count: result.data.entries.length, truncated: result.data.truncated })} />; },
      bodyRenderer: ({ result }) => {
  const i18n = useI18n();
        const data = result?.data;
        return data ? <div className="flex flex-col gap-2">
          <p className="type-caption break-all">{data.path}</p>
          {!data.entries.length && <p className="type-caption">{i18n.formatMessage(filesystemMessages.toolDirectoryEmpty)}</p>}
          <ul className="max-h-80 overflow-auto type-code">{data.entries.map(entry =>
            <li key={entry.name} className="break-all">{entry.name}{entry.type === "directory" ? "/" : ""}</li>)}</ul>
          {data.truncated && <p className="type-caption">{i18n.formatMessage(filesystemMessages.toolDirectoryTruncated)}</p>}
        </div> : null;
      },
    }),
  ],
  creations: [creationEntry(CreateDirectory, { id: "atelier.core/directory.local", label: filesystemMessages.directoryLabel, icon: <Folder className="size-4" />, group: "resources", InputView: DirectoryInput,
    triggers: { menu: {}, drop: { accepts: { files: { directories: true } }, toInput: item => item.kind === "file" && item.directory && item.path ? { path: item.path } : null } } })],
} satisfies RendererModule;
