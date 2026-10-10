import { Folder, ListTree } from "lucide-react";
import { cardRenderer, toolRenderer, type RendererModule } from "../../renderer/modules/registry";
import { s } from "../../renderer/features/configuration/state";
import { t } from "../../renderer/shared/i18n";
import { DirectoryView, DirectoryList } from "./contract";

export default {
  resources: [{ kind: "directory", label: s("Directory", "目录"), icon: <Folder className="size-4" /> }],
  cards: [cardRenderer(DirectoryView, {
    width: 340,
    Body: ({ data }) => <div className="max-h-80 select-text overflow-auto p-3">
      <p className="type-body break-all font-mono text-xs">{data.path}</p>
    </div>,
  })],
  tools: [
    toolRenderer(DirectoryList, {
      label: t.toolDirectoryList,
      icon: <ListTree className="size-3.5" />,
      headerRenderer: ({ target, invocation, result }) => <span className="flex min-w-0 flex-wrap items-center gap-x-2">
        <span>{t.toolDirectoryList}</span>
        <span className="truncate font-mono">{invocation.resource?.title}{target?.path && target.path !== "." ? ` / ${target.path}` : ""}</span>
        {result?.data && <span className="type-caption">{t.toolEntryCount(result.data.entries.length, result.data.truncated)}</span>}
      </span>,
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
