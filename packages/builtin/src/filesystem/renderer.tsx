import { lazy } from "react";
import { useI18n, useRendererObject, creationEntry, cardRenderer, toolRenderer, type RendererModule, type ToolRenderProps } from "@asterism-app/sdk/renderer";
import type { z } from "zod";
import { Eye, Folder, BookOpen, FileDown, FilePenLine, FilePlus2, ListTree, Replace } from "lucide-react";

import { ToolHeader } from "@asterism-app/ui/tool-header";
import { filesystemMessages } from "../messages/filesystem";
import { textMessages } from "../messages/text";
import { prepareCodeView } from "../shared/code-view";
import { textReadViews, textWriteViews, textEditViews, textReplaceViews } from "../text-view";
import { inputText } from "../shared/tool-preview";
import { Directory, CreateDirectory, DirectoryView, DirectoryList, DirectoryRead, DirectoryEdit, DirectoryWrite, DirectorySave, DirectoryReplace, DirectorySee } from "./contract";
import { FilePreview } from "../shared/attachments";
import { mediaMessages } from "../messages/media";
import { DirectoryInput } from "./creation";
import { execToolRenderer } from "./exec-view";
import { useDirectoryTreeLink } from "./tree-link";
import { FileTreeBody, FileTreeRefresh } from "./FileTree";
import { searchToolRenderers } from "./search-view";
import { listViews } from "./list-view";

import { directoryCard as appearance } from "../shared/card-appearance.ts";
const DirectoryFile = lazy(() => import("./DirectoryFile"));

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

function DirectoryTreeActions() {
  const { link, state } = useDirectoryTreeLink();
  return <FileTreeRefresh loading={state.loading} reload={() => link.reload()} />;
}

function DirectoryTreeBody() {
  const { state } = useDirectoryTreeLink();
  return <FileTreeBody state={state} FileView={DirectoryFile} />;
}

export default {
  prepare: prepareCodeView,
  resources: [{ kind: Directory.kind, label: filesystemMessages.directory, icon: <Folder className="size-4" />, card: appearance }],
  cards: [cardRenderer(DirectoryView, {
    ...appearance,
    Body: DirectoryTreeBody,
    Actions: DirectoryTreeActions,
  })],
  tools: [
    toolRenderer(DirectorySave, { label: mediaMessages.save, icon: <FileDown /> }),
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
    toolRenderer(DirectoryReplace, {
      label: textMessages.toolTextReplace, icon: <Replace className="size-3.5" />,
      ...textReplaceViews,
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
