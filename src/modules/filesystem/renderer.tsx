import { Folder } from "lucide-react";
import { cardRenderer, resultRenderer, type RendererModule } from "../../renderer/modules/registry";
import { s } from "../../renderer/features/configuration/state";
import { DirectoryView, DirectoryRead, DirectoryList } from "./contract";

export default {
  cards: [cardRenderer(DirectoryView, {
    label: s("Directory", "目录"), icon: <Folder className="size-4" />, width: 340, connection: "source",
    Body: ({ data }) => <div className="max-h-80 select-text overflow-auto p-3">
      <p className="type-body break-all font-mono text-xs">{data.path}</p>
    </div>,
  })],
  results: [
    resultRenderer(DirectoryRead, ({ data }) => <div className="flex flex-col gap-2">
      <p className="type-caption break-all">{data.path}</p>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">{data.text}</pre>
    </div>),
    resultRenderer(DirectoryList, ({ data }) => <div className="flex flex-col gap-2">
      <p className="type-caption break-all">{data.path}</p>
      <ul className="max-h-80 overflow-auto font-mono text-xs">{data.entries.map(entry =>
        <li key={entry.name} className="break-all">{entry.name}{entry.type === "directory" ? "/" : ""}</li>)}</ul>
      {data.truncated && <p className="type-caption">{s("Showing the first 500 entries.", "仅显示前 500 项。")}</p>}
    </div>),
  ],
} satisfies RendererModule;
