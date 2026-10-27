import { useEffect, useState, type CSSProperties } from "react";
import { useI18n, useRendererObject, creationEntry, cardRenderer, toolRenderer, type RendererModule, type ToolRenderProps } from "@asterism/sdk/renderer";
import type { z } from "zod";
import { Eye, Folder, BookOpen, FilePenLine, FilePlus2, ListTree, RefreshCw } from "lucide-react";
import { FileTree, useFileTree, useFileTreeSearch } from "@pierre/trees/react";
import type { GitStatus } from "@pierre/trees";

import { ToolHeader } from "@asterism/ui/tool-header";
import { IconButton } from "@asterism/ui/ui/icon-button";
import { SearchInput } from "@asterism/ui/ui/search-input";
import { cn } from "@asterism/ui/utils";
import { filesystemMessages } from "../messages/filesystem";
import { textMessages } from "../messages/text";
import { prepareCodeView } from "../shared/code-view";
import { textReadViews, textWriteViews, textEditViews } from "../text-view";
import { inputText } from "../shared/tool-preview";
import { CreateDirectory, DirectoryView, DirectoryList, DirectoryRead, DirectoryEdit, DirectoryWrite, DirectorySee } from "./contract";
import { FilePreview } from "../agent/conversation/Files";
import { DirectoryInput } from "./creation";
import { execToolRenderer } from "./exec-view";
import { useDirectoryTreeLink } from "./tree-link";
import { searchToolRenderers } from "./search-view";
import { listViews } from "./list-view";

import { directoryCard as appearance } from "../shared/card-appearance.ts";

type SeeProps = ToolRenderProps<z.infer<typeof DirectorySee.schema>>;
function SeeHeader({ target, invocation }: SeeProps) {
  const i18n = useI18n();
  return <ToolHeader label={i18n.formatMessage(filesystemMessages.toolDirectorySee)} monospace
    subject={[invocation.resource?.title, inputText(target, "path")].filter(Boolean).join(" / ")} />;
}
function SeeBody({ result }: SeeProps) {
  const object = useRendererObject();
  const data = result?.data;
  return data ? <FilePreview part={{ kind: "file", file: data.image, mediaType: data.mediaType, filename: data.path }} content={object.content} /> : null;
}
const seeView = { headerRenderer: SeeHeader, bodyRenderer: SeeBody };

/** Title-bar refresh button: shares the same DirectoryTreeLink instance with Body. */
function DirectoryTreeActions(_: { data: { path: string } }) {
  const i18n = useI18n();
  const { link, state } = useDirectoryTreeLink();
  return <IconButton size="icon-xs" label={i18n.formatMessage(filesystemMessages.directoryRefresh)} disabled={state.loading} onClick={() => link.reload()}>
    <RefreshCw className={cn(state.loading && "animate-spin")} />
  </IconButton>;
}

/**
 * File-tree appearance maps to public tokens: row backgrounds are inset rounded blocks (matching sidebar lists), with icons and text aligned respectively
 * to the title bar's icon column (12px) and name column (36px). Horizontal spacing is 6px scroll-area padding + 2px row margin + 4px row padding.
 */
const treeStyle = {
  height: "100%",
  "--trees-bg-override": "var(--card)",
  "--trees-fg-override": "var(--card-foreground)",
  "--trees-fg-muted-override": "var(--muted-foreground)",
  "--trees-bg-muted-override": "var(--accent)",
  "--trees-selected-bg-override": "var(--selected)",
  "--trees-selected-fg-override": "var(--selected-foreground)",
  "--trees-selected-focused-border-color-override": "transparent",
  "--trees-focus-ring-color-override": "var(--ring)",
  "--trees-indent-guide-bg-override": "var(--border)",
  "--trees-border-radius-override": "calc(var(--radius) - 2px)",
  "--trees-font-family-override": "var(--font-sans)",
  "--trees-font-size-override": "0.875rem",
  "--trees-padding-inline-override": "8px",
  "--trees-item-padding-x-override": "4px",
  "--trees-item-row-gap-override": "8px",
} as CSSProperties;

/** Card body: edge-aligned filter bar + file tree; explanatory text fills empty-directory, no-match, and read-failure states. */
function DirectoryTreeBody(_: { data: { path: string } }) {
  const i18n = useI18n();
  const { state } = useDirectoryTreeLink();
  const { model } = useFileTree({ paths: [], initialExpansion: "closed", itemHeight: 28, icons: { set: "complete", colored: false } });
  const search = useFileTreeSearch(model);
  // The input preserves exactly what the user typed; the model trims and lowercases internally for matching without writing it back to the input.
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!state.data) return;
    model.resetPaths(state.data.paths);
    model.setGitStatus(state.data.gitStatus.map(e => ({ path: e.path, status: e.status as GitStatus })));
  }, [model, state.data]);

  const empty = state.data?.paths.length === 0;
  const noMatches = !empty && query.trim() !== "" && search.matchingPaths.length === 0;
  const notice = state.error ?? (empty ? i18n.formatMessage(filesystemMessages.toolDirectoryEmpty)
    : noMatches ? i18n.formatMessage(filesystemMessages.directoryNoMatches) : null);

  return <div className="nodrag nopan flex min-h-0 flex-1 flex-col">
    <div className="shrink-0 border-b">
      <SearchInput variant="inline" value={query} onChange={value => { setQuery(value); search.setValue(value === "" ? null : value); }}
        label={i18n.formatMessage(filesystemMessages.directorySearch)} />
    </div>
    <div className="relative min-h-0 flex-1 pt-1">
      <div className={cn("h-full", notice && "invisible")}><FileTree model={model} style={treeStyle} /></div>
      {notice && <p className={cn("type-caption absolute inset-x-0 top-0 px-2 py-2", state.error && "text-destructive")}>{notice}</p>}
    </div>
  </div>;
}

export default {
  prepare: prepareCodeView,
  resources: [{ kind: "asterism.builtin/directory", label: filesystemMessages.directory, icon: <Folder className="size-4" />, card: appearance }],
  cards: [cardRenderer(DirectoryView, {
    ...appearance,
    Body: DirectoryTreeBody,
    Actions: DirectoryTreeActions,
  })],
  tools: [
    ...searchToolRenderers,
    execToolRenderer,
    toolRenderer(DirectoryRead, {
      label: textMessages.toolTextRead, icon: <BookOpen className="size-3.5" />,
      ...textReadViews,
    }),
    toolRenderer(DirectoryEdit, {
      label: textMessages.toolTextEdit, icon: <FilePenLine className="size-3.5" />,
      ...textEditViews,
    }),
    toolRenderer(DirectoryWrite, {
      label: textMessages.toolTextWrite, icon: <FilePlus2 className="size-3.5" />,
      ...textWriteViews,
    }),
    toolRenderer(DirectorySee, {
      label: filesystemMessages.toolDirectorySee, icon: <Eye className="size-3.5" />,
      input: { headerRenderer: SeeHeader }, execution: { headerRenderer: SeeHeader }, result: seeView,
    }),
    toolRenderer(DirectoryList, {
      label: filesystemMessages.toolDirectoryList,
      icon: <ListTree className="size-3.5" />,
      ...listViews,
    }),
  ],
  creations: [creationEntry(CreateDirectory, { id: "asterism.builtin/directory.local", label: filesystemMessages.directoryLabel, icon: <Folder className="size-4" />, group: "resources", InputView: DirectoryInput,
    triggers: { menu: {}, drop: { accepts: { files: { directories: true } }, toInput: item => item.kind === "file" && item.directory && item.path ? { path: item.path } : null } } })],
} satisfies RendererModule;
