import { BookOpen, FileSearch, ListTree, Search } from "lucide-react";
import { cardRenderer, creationEntry, toolRenderer, useI18n, type RendererModule } from "@asterism/sdk/renderer";
import { Manual, CreateManual, ManualView, ManualList, ManualRead, ManualFind, ManualGrep } from "./contract";
import { manualMessages as messages } from "../messages/manual";
import { filesystemMessages } from "../messages/filesystem";
import { textMessages } from "../messages/text";
import { manualCard as appearance } from "../shared/card-appearance";
import { prepareCodeView } from "../shared/code-view";
import { textReadViews } from "../text-view";
import { listViews } from "../filesystem/list-view";
import { findViews, grepViews } from "../filesystem/search-view";

function ManualBody() {
  return <p className="type-body p-3 text-muted-foreground">{useI18n().text(messages.description)}</p>;
}

export default {
  prepare: prepareCodeView,
  resources: [{ kind: Manual.kind, label: messages.title, icon: <BookOpen className="size-4" />, card: appearance }],
  cards: [cardRenderer(ManualView, { ...appearance, Body: ManualBody })],
  creations: [creationEntry(CreateManual, {
    id: "asterism.builtin/manual.open", label: messages.title, icon: <BookOpen className="size-4" />,
    group: "resources", triggers: { menu: { initialInput: {} } },
  })],
  tools: [
    toolRenderer(ManualList, { label: filesystemMessages.toolDirectoryList, icon: <ListTree className="size-3.5" />, ...listViews }),
    toolRenderer(ManualRead, { label: textMessages.toolTextRead, icon: <BookOpen className="size-3.5" />, ...textReadViews }),
    toolRenderer(ManualFind, { label: filesystemMessages.toolDirectoryFind, icon: <FileSearch className="size-3.5" />, ...findViews }),
    toolRenderer(ManualGrep, { label: filesystemMessages.toolDirectoryGrep, icon: <Search className="size-3.5" />, ...grepViews }),
  ],
} satisfies RendererModule;
