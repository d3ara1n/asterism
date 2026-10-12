import { useI18n, creationEntry, cardRenderer, toolRenderer, type RendererModule } from "@atelier/sdk/renderer";
import { FileText, BookOpen, FilePenLine, FilePlus2 } from "lucide-react";

import { ToolHeader } from "../../renderer/shared/tool-header";
import { commonMessages } from "../messages/common";
import { textMessages } from "../messages/text";
import { TextReadBody, TextChangeBody } from "../text-view";
import { CreateNote, NoteView, NoteRead, NoteEdit, NoteWrite } from "./contract";
import { NoteInput } from "./creation";

const appearance = { width: 340, height: 320, minWidth: 280, minHeight: 160 };

export default {
  resources: [{ kind: "atelier.core/note", label: commonMessages.kindNote, icon: <FileText className="size-4" />, card: appearance }],
  cards: [cardRenderer(NoteView, {
    ...appearance,
    Body: ({ data }) => { const i18n = useI18n(); return <div className="min-h-0 flex-1 select-text overflow-auto p-3">
      {data.text !== null ? <p className="type-body whitespace-pre-wrap break-words">{data.text}</p>
        : <p className="type-body text-muted-foreground">{i18n.formatMessage(textMessages.contentUnavailable)}</p>}
    </div>; },
  })],
  tools: [
    toolRenderer(NoteRead, {
      label: textMessages.toolTextRead, icon: <BookOpen className="size-3.5" />,
      headerRenderer: ({ invocation, result }) => { const i18n = useI18n(); return <ToolHeader label={i18n.formatMessage(textMessages.toolTextRead)}
        subject={invocation.resource?.title}
        meta={result?.data && i18n.formatMessage(textMessages.toolTextLines, { shown: result.data.rows.length, total: result.data.totalLines })} />; },
      bodyRenderer: TextReadBody,
    }),
    toolRenderer(NoteEdit, {
      label: textMessages.toolTextEdit, icon: <FilePenLine className="size-3.5" />,
      headerRenderer: ({ invocation, result }) => { const i18n = useI18n(); return <ToolHeader label={i18n.formatMessage(textMessages.toolTextEdit)}
        subject={invocation.resource?.title}
        meta={result?.data && <>+{result.data.added} −{result.data.removed}</>} />; },
      bodyRenderer: TextChangeBody,
    }),
    toolRenderer(NoteWrite, {
      label: textMessages.toolTextWrite, icon: <FilePlus2 className="size-3.5" />,
      headerRenderer: ({ invocation, result }) => { const i18n = useI18n(); return <ToolHeader label={i18n.formatMessage(textMessages.toolTextWrite)}
        subject={invocation.resource?.title}
        meta={result?.data && <>+{result.data.added} −{result.data.removed}</>} />; },
      bodyRenderer: TextChangeBody,
    }),
  ],
  creations: [creationEntry(CreateNote, { id: "atelier.core/note.blank", label: commonMessages.kindNote, icon: <FileText className="size-4" />, group: "resources", InputView: NoteInput,
    triggers: { menu: {}, drop: { accepts: { text: true }, toInput: item => item.kind === "text" ? { title: item.text.split("\n")[0]!.trim().slice(0, 160) || "Untitled note", content: item.text.slice(0, 100_000) } : null } } })],
} satisfies RendererModule;
