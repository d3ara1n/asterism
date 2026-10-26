import { useState } from "react";
import { useI18n, creationEntry, cardRenderer, toolRenderer, type RendererModule } from "@asterism/sdk/renderer";
import { FileText, BookOpen, FilePenLine, FilePlus2, Copy } from "lucide-react";
import { toast } from "sonner";
import { IconButton } from "@asterism/ui/ui/icon-button";

import { Markdown } from "../agent/conversation/Markdown";
import { commonMessages } from "../messages/common";
import { textMessages } from "../messages/text";
import { prepareCodeView } from "../shared/code-view";
import { textReadViews, textWriteViews, textEditViews } from "../text-view";
import { CreateNote, NoteView, NoteRead, NoteEdit, NoteWrite } from "./contract";
import { NoteInput } from "./creation";

import { noteCard as appearance } from "../shared/card-appearance.ts";

function NoteActions({ data }: { data: { text: string | null } }) {
  const i18n = useI18n();
  const [copying, setCopying] = useState(false);
  const copy = async () => {
    if (data.text === null || copying) return;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(data.text);
      toast.success(i18n.text(textMessages.noteCopied));
    } catch (error) {
      console.error("Note could not be copied.", error);
      toast.error(i18n.text(textMessages.noteCopyFailed));
    } finally {
      setCopying(false);
    }
  };
  return <IconButton size="icon-xs" label={i18n.text(textMessages.copyNoteMarkdown)}
    disabled={data.text === null || copying} onClick={() => { void copy(); }}>
    <Copy />
  </IconButton>;
}

export default {
  prepare: prepareCodeView,
  resources: [{ kind: "asterism.builtin/note", label: commonMessages.kindNote, icon: <FileText className="size-4" />, card: appearance }],
  cards: [cardRenderer(NoteView, {
    ...appearance,
    Actions: NoteActions,
    Body: ({ data }) => { const i18n = useI18n(); return <div className="content-scrollbar min-h-0 flex-1 select-text overflow-auto p-3">
      {data.text !== null ? <Markdown>{data.text}</Markdown>
        : <p className="type-body text-muted-foreground">{i18n.formatMessage(textMessages.contentUnavailable)}</p>}
    </div>; },
  })],
  tools: [
    toolRenderer(NoteRead, {
      label: textMessages.toolTextRead, icon: <BookOpen className="size-3.5" />,
      ...textReadViews,
    }),
    toolRenderer(NoteEdit, {
      label: textMessages.toolTextEdit, icon: <FilePenLine className="size-3.5" />,
      ...textEditViews,
    }),
    toolRenderer(NoteWrite, {
      label: textMessages.toolTextWrite, icon: <FilePlus2 className="size-3.5" />,
      ...textWriteViews,
    }),
  ],
  creations: [creationEntry(CreateNote, { id: "asterism.builtin/note.blank", label: commonMessages.kindNote, icon: <FileText className="size-4" />, group: "resources", InputView: NoteInput,
    triggers: { menu: {}, drop: { accepts: { text: true }, toInput: item => item.kind === "text" ? { title: item.text.split("\n")[0]!.trim().slice(0, 160) || "Untitled note", content: item.text.slice(0, 100_000) } : null } } })],
} satisfies RendererModule;
