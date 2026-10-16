import { useI18n, useRendererObject, creationEntry, cardRenderer, toolRenderer, type RendererModule, type ToolRenderProps } from "@atelier/sdk/renderer";
import type { z } from "zod";
import { Eye, Folder, BookOpen, FilePenLine, FilePlus2, ListTree } from "lucide-react";

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

const appearance = { width: 340, height: 200, minWidth: 280, minHeight: 160 };

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
/** 结果图片复用附件预览，按对象当前路径上的记录根读取。 */
function SeeBody({ result }: SeeProps) {
  const object = useRendererObject();
  const data = result?.data;
  return data ? <FilePreview part={{ kind: "file", file: data.image, mediaType: data.mediaType, filename: data.path }} content={object.content} /> : null;
}
const seeView = { headerRenderer: SeeHeader, bodyRenderer: SeeBody };
const listView = { headerRenderer: ListHeader, bodyRenderer: ListBody };

export default {
  prepare: prepareCodeView,
  resources: [{ kind: "atelier.builtin/directory", label: filesystemMessages.directory, icon: <Folder className="size-4" />, card: appearance }],
  cards: [cardRenderer(DirectoryView, {
    ...appearance,
    Body: ({ data }) => {  return <div className="min-h-0 flex-1 select-text overflow-auto p-3">
      <p className="type-body break-all font-mono text-xs">{data.path}</p>
    </div>; },
  })],
  tools: [
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
