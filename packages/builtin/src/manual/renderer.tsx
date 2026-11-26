import { fileReferenceProvider } from "../filesystem/reference-provider";
import { lazy } from "react";
import { BookOpen, FileText, FileSearch, ListTree, TextSearch } from "lucide-react";
import { cardRenderer, creationEntry, toolRenderer, CardHeader, type RendererModule } from "@asterism-app/sdk/renderer";
import { Manual, CreateManual, ManualView, ManualList, ManualRead, ManualFind, ManualGrep, ManualChildren, SearchManualReferences } from "./contract";
import { manualMessages as messages } from "../messages/manual";
import { filesystemMessages } from "../messages/filesystem";
import { textMessages } from "../messages/text";
import { manualCard as appearance } from "../shared/card-appearance";
import { prepareCodeView } from "@asterism-app/ui/code-view";
import { textReadViews } from "../text-view";
import { listViews } from "../filesystem/list-view";
import { findViews, grepViews } from "../filesystem/search-view";
import { FileTreeBody, FileTreeActions, FileTreeChanges } from "../filesystem/FileTree";
import { useTreeStore } from "../filesystem/tree-store";
import { fileOpener } from "../filesystem/open-file";

const ManualFile = lazy(() => import("./ManualFile"));
const useManualTree = () => useTreeStore("asterism.builtin/manual-tree", (calls, ref) => ({
  children: (path, signal) => calls.invoke(ManualChildren, { path }, { object: ref, signal }),
}));

function ManualBody() {
  const { store, state } = useManualTree();
  return <FileTreeBody store={store} state={state} />;
}

function ManualHeader() {
  const { store, state } = useManualTree();
  return <CardHeader summary={state.changes ? <FileTreeChanges state={state} /> : undefined} actions={<FileTreeActions store={store} state={state} />} />;
}

export default {
  prepare: prepareCodeView,
  resources: [{ kind: Manual.kind, label: messages.title, icon: <BookOpen className="size-4" />, card: appearance, referenceTargets: fileReferenceProvider(SearchManualReferences), open: fileOpener(ManualFile) }],
  cards: [cardRenderer(ManualView, { ...appearance, Body: ManualBody, Header: ManualHeader })],
  creations: [creationEntry(CreateManual, {
    id: "asterism.builtin/manual.open", label: messages.title, icon: <BookOpen className="size-4" />,
    group: "resources", triggers: { menu: { initialInput: {} } },
  })],
  tools: [
    toolRenderer(ManualList, { label: filesystemMessages.toolDirectoryList, icon: <ListTree className="size-3.5" />, ...listViews }),
    toolRenderer(ManualRead, { label: textMessages.toolTextRead, icon: <FileText className="size-3.5" />, ...textReadViews }),
    toolRenderer(ManualFind, { label: filesystemMessages.toolDirectoryFind, icon: <FileSearch className="size-3.5" />, ...findViews }),
    toolRenderer(ManualGrep, { label: filesystemMessages.toolDirectoryGrep, icon: <TextSearch className="size-3.5" />, ...grepViews }),
  ],
} satisfies RendererModule;
