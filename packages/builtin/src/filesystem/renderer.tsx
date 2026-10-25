import { useEffect, useState, type CSSProperties } from "react";
import { useI18n, useRendererObject, creationEntry, cardRenderer, toolRenderer, type RendererModule, type ToolRenderProps } from "@atelier/sdk/renderer";
import type { z } from "zod";
import { Eye, Folder, BookOpen, FilePenLine, FilePlus2, ListTree, RefreshCw } from "lucide-react";
import { FileTree, useFileTree, useFileTreeSearch } from "@pierre/trees/react";
import type { GitStatus } from "@pierre/trees";

import { ToolHeader } from "@atelier/ui/tool-header";
import { IconButton } from "@atelier/ui/ui/icon-button";
import { SearchInput } from "@atelier/ui/ui/search-input";
import { cn } from "@atelier/ui/utils";
import { filesystemMessages } from "../messages/filesystem";
import { textMessages } from "../messages/text";
import { prepareCodeView } from "../shared/code-view";
import { textReadViews, textWriteViews, textEditViews } from "../text-view";
import { inputText } from "../shared/tool-preview";
import { TOOL_BODY_LINE_LIMIT } from "../shared/tool-body";
import { CreateDirectory, DirectoryView, DirectoryList, DirectoryRead, DirectoryEdit, DirectoryWrite, DirectorySee } from "./contract";
import { FilePreview } from "../agent/conversation/Files";
import { DirectoryInput } from "./creation";
import { execToolRenderer } from "./exec-view";
import { useDirectoryTreeLink } from "./tree-link";
import { searchToolRenderers } from "./search-view";

const appearance = { width: 340, height: 360, minWidth: 280, minHeight: 200 };

type ListProps = ToolRenderProps<z.infer<typeof DirectoryList.schema>>;
function ListHeader({ target, invocation, result }: ListProps) {
  const i18n = useI18n();
  const path = inputText(target, "path");
  return <ToolHeader label={i18n.formatMessage(filesystemMessages.toolDirectoryList)} monospace
    subject={[invocation.resource?.title, path && path !== "." ? path : null].filter(Boolean).join(" / ")}
    meta={result?.data && i18n.formatMessage(filesystemMessages.toolEntryCount, { count: result.data.entries.length, truncated: result.data.truncated })} />;
}
function ListBody({ result }: ListProps) {
  const i18n = useI18n();
  const data = result?.data;
  return data ? <div className="flex flex-col gap-2">
    <p className="type-caption break-all">{data.path}</p>
    {!data.entries.length && <p className="type-caption">{i18n.formatMessage(filesystemMessages.toolDirectoryEmpty)}</p>}
    <ul className="type-code">{data.entries.slice(0, TOOL_BODY_LINE_LIMIT).map(entry =>
      <li key={entry.name} className="break-all">{entry.name}{entry.type === "directory" ? "/" : ""}</li>)}</ul>
    {data.entries.length > TOOL_BODY_LINE_LIMIT && <p className="type-caption">{i18n.formatMessage(textMessages.toolTextPreviewOmitted, { count: data.entries.length - TOOL_BODY_LINE_LIMIT })}</p>}
    {data.truncated && <p className="type-caption">{i18n.formatMessage(filesystemMessages.toolDirectoryTruncated)}</p>}
  </div> : null;
}
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
const listView = { headerRenderer: ListHeader, bodyRenderer: ListBody };

/** 标题栏刷新按钮：与 Body 共享同一 DirectoryTreeLink 实例。 */
function DirectoryTreeActions(_: { data: { path: string } }) {
  const i18n = useI18n();
  const { link, state } = useDirectoryTreeLink();
  return <IconButton size="icon-xs" label={i18n.formatMessage(filesystemMessages.directoryRefresh)} disabled={state.loading} onClick={() => link.reload()}>
    <RefreshCw className={cn(state.loading && "animate-spin")} />
  </IconButton>;
}

/**
 * 文件树外观映射到公共 token：行背景内缩为圆角块（与侧栏列表一致），图标与文字分别对齐
 * 标题栏的图标列（12px）与名称列（36px）。滚动区左右内边距 6px + 行外边距 2px + 行内边距 4px。
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

/** 卡片正文：贴边筛选条 + 文件树；空目录、无匹配与读取失败以说明文字占位。 */
function DirectoryTreeBody(_: { data: { path: string } }) {
  const i18n = useI18n();
  const { state } = useDirectoryTreeLink();
  const { model } = useFileTree({ paths: [], initialExpansion: "closed", itemHeight: 28, icons: { set: "complete", colored: false } });
  const search = useFileTreeSearch(model);
  // 输入框保留用户原样输入；模型内部 trim 并小写化后匹配，不回填到输入框。
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

  return <div className="nodrag nopan nowheel flex min-h-0 flex-1 flex-col">
    <div className="shrink-0 border-b">
      <SearchInput variant="inline" value={query} onChange={value => { setQuery(value); search.setValue(value === "" ? null : value); }}
        label={i18n.formatMessage(filesystemMessages.directorySearch)} />
    </div>
    <div className="relative min-h-0 flex-1 pt-1">
      <div className={cn("h-full", notice && "invisible")}><FileTree model={model} style={treeStyle} /></div>
      {notice && <p className={cn("type-caption absolute inset-x-0 top-0 px-3 py-2", state.error && "text-destructive")}>{notice}</p>}
    </div>
  </div>;
}

export default {
  prepare: prepareCodeView,
  resources: [{ kind: "atelier.builtin/directory", label: filesystemMessages.directory, icon: <Folder className="size-4" />, card: appearance }],
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
      input: { headerRenderer: ListHeader }, execution: listView, result: listView,
    }),
  ],
  creations: [creationEntry(CreateDirectory, { id: "atelier.builtin/directory.local", label: filesystemMessages.directoryLabel, icon: <Folder className="size-4" />, group: "resources", InputView: DirectoryInput,
    triggers: { menu: {}, drop: { accepts: { files: { directories: true } }, toInput: item => item.kind === "file" && item.directory && item.path ? { path: item.path } : null } } })],
} satisfies RendererModule;
