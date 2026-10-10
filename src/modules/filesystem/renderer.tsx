import { Folder, ListTree, BookOpen, FilePenLine, FilePlus2 } from "lucide-react";
import { cardRenderer, toolRenderer, type RendererModule } from "../../renderer/modules/registry";
import { s } from "../../renderer/features/configuration/state";
import { t } from "../../renderer/shared/i18n";
import { DirectoryView, DirectoryList, DirectoryRead, DirectoryEdit, DirectoryWrite } from "./contract";
import { TextReadBody, TextChangeBody } from "../text-view";
import { ToolHeader } from "../../renderer/shared/tool-header";

const appearance = { width: 340, height: 200, minWidth: 280, minHeight: 160 };

export default {
  resources: [{ kind: "directory", label: s("Directory", "目录"), icon: <Folder className="size-4" />, card: appearance }],
  cards: [cardRenderer(DirectoryView, {
    ...appearance,
    Body: ({ data }) => <div className="min-h-0 flex-1 select-text overflow-auto p-3">
      <p className="type-body break-all font-mono text-xs">{data.path}</p>
    </div>,
  })],
  tools: [
    toolRenderer(DirectoryRead, {
      label: t.toolTextRead, icon: <BookOpen className="size-3.5" />,
      headerRenderer: ({ target, invocation, result }) => <ToolHeader label={t.toolTextRead} monospace
        subject={[invocation.resource?.title, target.path].filter(Boolean).join(" / ")}
        meta={result?.data && t.toolTextLines(result.data.rows.length, result.data.totalLines)} />,
      bodyRenderer: TextReadBody,
    }),
    toolRenderer(DirectoryEdit, {
      label: t.toolTextEdit, icon: <FilePenLine className="size-3.5" />,
      headerRenderer: ({ target, invocation, result }) => <ToolHeader label={t.toolTextEdit} monospace
        subject={[invocation.resource?.title, target.path].filter(Boolean).join(" / ")}
        meta={result?.data && <>+{result.data.added} −{result.data.removed}</>} />,
      bodyRenderer: TextChangeBody,
    }),
    toolRenderer(DirectoryWrite, {
      label: t.toolTextWrite, icon: <FilePlus2 className="size-3.5" />,
      headerRenderer: ({ target, invocation, result }) => <ToolHeader label={t.toolTextWrite} monospace
        subject={[invocation.resource?.title, target.path].filter(Boolean).join(" / ")}
        meta={result?.data && <>+{result.data.added} −{result.data.removed}</>} />,
      bodyRenderer: TextChangeBody,
    }),
    toolRenderer(DirectoryList, {
      label: t.toolDirectoryList,
      icon: <ListTree className="size-3.5" />,
      headerRenderer: ({ target, invocation, result }) => <ToolHeader label={t.toolDirectoryList} monospace
        subject={[invocation.resource?.title, target?.path && target.path !== "." ? target.path : null].filter(Boolean).join(" / ")}
        meta={result?.data && t.toolEntryCount(result.data.entries.length, result.data.truncated)} />,
      bodyRenderer: ({ result }) => {
        const data = result?.data;
        return data ? <div className="flex flex-col gap-2">
          <p className="type-caption break-all">{data.path}</p>
          {!data.entries.length && <p className="type-caption">{t.toolDirectoryEmpty}</p>}
          <ul className="max-h-80 overflow-auto type-code">{data.entries.map(entry =>
            <li key={entry.name} className="break-all">{entry.name}{entry.type === "directory" ? "/" : ""}</li>)}</ul>
          {data.truncated && <p className="type-caption">{t.toolDirectoryTruncated}</p>}
        </div> : null;
      },
    }),
  ],
} satisfies RendererModule;
