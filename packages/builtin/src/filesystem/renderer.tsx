import { useEffect } from "react";
import { useI18n, useRendererObject, creationEntry, cardRenderer, toolRenderer, type RendererModule, type ToolRenderProps } from "@atelier/sdk/renderer";
import type { z } from "zod";
import { Eye, Folder, BookOpen, FilePenLine, FilePlus2, ListTree, RefreshCw } from "lucide-react";
import { FileTree, useFileTree } from "@pierre/trees/react";
import type { GitStatus } from "@pierre/trees";

import { ToolHeader } from "@atelier/ui/tool-header";
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
  const { link, state } = useDirectoryTreeLink();
  return <button
    className="text-muted-foreground hover:text-foreground rounded p-1 transition-colors disabled:opacity-40"
    disabled={state.loading}
    onClick={() => link.reload()}
    aria-label="Refresh"
  >
    <RefreshCw className={`size-3 ${state.loading ? "animate-spin" : ""}`} />
  </button>;
}

/** 卡片正文：边到边的文件树，无子标题。 */
function DirectoryTreeBody(_: { data: { path: string } }) {
  const { state } = useDirectoryTreeLink();

  const { model } = useFileTree({ paths: [], initialExpansion: "closed", search: true });

  useEffect(() => {
    if (!state.data) return;
    model.resetPaths(state.data.paths);
    if (state.data.hasGit && state.data.gitStatus.length > 0) {
      model.setGitStatus(state.data.gitStatus.map(e => ({ path: e.path, status: e.status as GitStatus })));
    }
  }, [model, state.data]);

  if (state.error) {
    return <p className="type-caption m-3 text-destructive">{state.error}</p>;
  }

  return <div className="nodrag nopan nowheel min-h-0 flex-1">
    <FileTree
      model={model}
      style={{
        height: "100%",
        "--trees-bg-override": "var(--card)",
        "--trees-fg-override": "var(--foreground)",
        "--trees-padding-inline-override": "0px",
        "--trees-border-radius-override": "0px",
      } as React.CSSProperties}
    />
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
