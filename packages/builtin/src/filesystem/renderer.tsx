import { lazy } from "react";
import { useI18n, useRendererApplication, useRendererObject, creationEntry, cardRenderer, toolRenderer, type RendererModule, type ToolRenderProps } from "@asterism-app/sdk/renderer";
import type { z } from "zod";
import { Eye, Folder, FolderOpen, FileText, FileDown, FilePenLine, FilePlus2, Info, ListTree, Replace } from "lucide-react";

import { toast } from "sonner";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { useSettingsAction } from "@asterism-app/ui/use-settings-action";
import { ToolHeader } from "@asterism-app/ui/tool-header";
import { useToolResourceSubject } from "@asterism-app/ui/tool-content";
import { filesystemMessages } from "../messages/filesystem";
import { textMessages } from "../messages/text";
import { prepareCodeView } from "@asterism-app/ui/code-view";
import { textReadViews, textWriteViews, textEditViews, textReplaceViews } from "../text-view";
import { inputText } from "../shared/tool-preview";
import { Directory, CreateDirectory, DirectoryView, DirectoryChildren, DirectoryStatus, DirectoryWatch, DirectoryList, DirectoryMetadata, DirectoryRead, DirectoryEdit, DirectoryWrite, DirectorySave, DirectoryReplace, DirectorySee } from "./contract";
import { FilePreview } from "../shared/attachments";
import { mediaMessages } from "../messages/media";
import { DirectoryInput } from "./creation";
import { execToolRenderer } from "./exec-view";
import { useTreeStore } from "./tree-store";
import { FileTreeBody, FileTreeActions } from "./FileTree";
import { searchToolRenderers } from "./search-view";
import { listViews } from "./list-view";
import { inspectPathRenderer } from "./inspection-view";
import { fileOpener } from "./open-file";

import { directoryCard as appearance } from "../shared/card-appearance.ts";
const DirectoryFile = lazy(() => import("./DirectoryFile"));

type SeeProps = ToolRenderProps<z.infer<typeof DirectorySee.schema>>;
function SeeHeader({ target, invocation }: SeeProps) {
  const i18n = useI18n();
  const path = inputText(target, "path");
  return <ToolHeader label={i18n.formatMessage(filesystemMessages.toolDirectorySee)}
    subject={useToolResourceSubject(invocation.resource)}
    summary={path && <span className="font-mono" title={path}>{path}</span>} />;
}
function SeeBody({ result }: SeeProps) {
  const object = useRendererObject();
  const data = result?.data;
  return data ? <FilePreview part={{ kind: "file", file: data.image, mediaType: data.mediaType, filename: data.path }} content={object.content} /> : null;
}
const seeView = { headerRenderer: SeeHeader, bodyRenderer: SeeBody };

const useDirectoryTree = () => useTreeStore("asterism.builtin/directory-tree", (calls, ref, object) => ({
  children: (path, signal) => calls.invoke(DirectoryChildren, { path }, { object: ref, signal }),
  status: signal => calls.invoke(DirectoryStatus, {}, { object: ref, signal }),
  watch: receive => {
    const channel = object.openChannel(DirectoryWatch);
    let stopped = false;
    channel.onMessage(receive);
    void channel.closed.then(end => {
      if (!stopped && end.reason !== "closed") receive({ type: "error" });
    });
    return () => { stopped = true; channel.close(); };
  },
}));

function DirectoryTreeActions({ data }: { data: { path: string } }) {
  const { store, state } = useDirectoryTree();
  const i18n = useI18n();
  const application = useRendererApplication();
  const { run, busy } = useSettingsAction(filesystemMessages.directoryOpenFailed, message => { toast.error(i18n.text(message)); });
  return <>
    <FileTreeActions store={store} state={state} />
    <IconButton size="icon-xs" label={i18n.text(filesystemMessages.directoryOpen)} disabled={busy} aria-busy={busy}
      onClick={() => { void run(() => application.openLocalFile(data.path)); }}>
      {busy ? <Spinner aria-hidden /> : <FolderOpen />}
    </IconButton>
  </>;
}

function DirectoryTreeBody() {
  const { store, state } = useDirectoryTree();
  return <FileTreeBody store={store} state={state} />;
}

export default {
  prepare: prepareCodeView,
  resources: [{ kind: Directory.kind, label: filesystemMessages.directory, icon: <Folder className="size-4" />, card: appearance, open: fileOpener(DirectoryFile) }],
  cards: [cardRenderer(DirectoryView, {
    ...appearance,
    Body: DirectoryTreeBody,
    Actions: DirectoryTreeActions,
  })],
  tools: [
    inspectPathRenderer,
    toolRenderer(DirectoryMetadata, { label: filesystemMessages.toolDirectoryMetadata, icon: <Info /> }),
    toolRenderer(DirectorySave, { label: mediaMessages.save, icon: <FileDown /> }),
    ...searchToolRenderers,
    execToolRenderer,
    toolRenderer(DirectoryRead, {
      label: textMessages.toolTextRead, icon: <FileText className="size-3.5" />,
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
