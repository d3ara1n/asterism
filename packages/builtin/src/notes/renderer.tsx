import { useI18n, creationEntry, cardRenderer, toolRenderer, type RendererModule } from "@asterism-app/sdk/renderer";
import { FileText, BookOpen, FilePenLine, FilePlus2, Replace, Search } from "lucide-react";

import { Markdown } from "@asterism-app/ui/markdown";
import { commonMessages } from "../messages/common";
import { textMessages } from "../messages/text";
import { filesystemMessages } from "../messages/filesystem";
import { prepareCodeView } from "@asterism-app/ui/code-view";
import { textReadViews, textWriteViews, textEditViews, textReplaceViews } from "../text-view";
import { Note, CreateNote, NoteView, NoteRead, NoteGrep, NoteEdit, NoteWrite, NoteReplace } from "./contract";
import { noteGrepViews } from "./search-view";
import { NoteInput } from "./creation";
import { NoteActions } from "./NoteActions";

import { noteCard as appearance } from "../shared/card-appearance.ts";

export default {
  prepare: prepareCodeView,
  resources: [{ kind: Note.kind, label: commonMessages.kindNote, icon: <FileText className="size-4" />, card: appearance }],
  cards: [cardRenderer(NoteView, {
    ...appearance,
    Actions: NoteActions,
    Body: ({ data }) => { const i18n = useI18n(); return <div className="min-h-0 flex-1 select-text overflow-auto p-3">
      {data.text !== null ? <Markdown>{data.text}</Markdown>
        : <p className="type-body text-muted-foreground">{i18n.formatMessage(textMessages.contentUnavailable)}</p>}
    </div>; },
  })],
  tools: [
    toolRenderer(NoteGrep, {
      label: filesystemMessages.toolDirectoryGrep, icon: <Search className="size-3.5" />,
      ...noteGrepViews,
    }),
    toolRenderer(NoteRead, {
      label: textMessages.toolTextRead, icon: <BookOpen className="size-3.5" />,
      ...textReadViews,
    }),
    toolRenderer(NoteEdit, {
      label: textMessages.toolTextEdit, icon: <FilePenLine className="size-3.5" />,
      ...textEditViews,
    }),
    toolRenderer(NoteReplace, {
      label: textMessages.toolTextReplace, icon: <Replace className="size-3.5" />,
      ...textReplaceViews,
    }),
    toolRenderer(NoteWrite, {
      label: textMessages.toolTextWrite, icon: <FilePlus2 className="size-3.5" />,
      ...textWriteViews,
    }),
  ],
  creations: [creationEntry(CreateNote, { id: "asterism.builtin/note.blank", label: commonMessages.kindNote, icon: <FileText className="size-4" />, group: "resources", InputView: NoteInput,
    triggers: { menu: {}, drop: { accepts: { text: true }, toInput: item => item.kind === "text" ? { title: item.text.split("\n")[0]!.trim().slice(0, 160) || "Untitled note", content: item.text.slice(0, 100_000) } : null } } })],
} satisfies RendererModule;
