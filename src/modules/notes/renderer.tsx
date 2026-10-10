import { FileText, BookOpen, FilePenLine, FilePlus2 } from "lucide-react";
import { cardRenderer, toolRenderer, type RendererModule } from "../../renderer/modules/registry";
import { t } from "../../renderer/shared/i18n";
import { NoteView, NoteRead, NoteEdit, NoteWrite } from "./contract";
import { TextReadBody, TextChangeBody } from "../text-view";
import { ToolHeader } from "../../renderer/shared/tool-header";

export default {
  resources: [{ kind: "note", label: t.kindNote, icon: <FileText className="size-4" /> }],
  cards: [cardRenderer(NoteView, {
    width: 340, height: 320, minWidth: 280, minHeight: 160,
    Body: ({ data }) => <div className="min-h-0 flex-1 select-text overflow-auto p-3">
      {data.text !== null ? <p className="type-body whitespace-pre-wrap break-words">{data.text}</p>
        : <p className="type-body text-muted-foreground">{t.contentUnavailable}</p>}
    </div>,
  })],
  tools: [
    toolRenderer(NoteRead, {
      label: t.toolTextRead, icon: <BookOpen className="size-3.5" />,
      headerRenderer: ({ invocation, result }) => <ToolHeader label={t.toolTextRead}
        subject={invocation.resource?.title}
        meta={result?.data && t.toolTextLines(result.data.rows.length, result.data.totalLines)} />,
      bodyRenderer: TextReadBody,
    }),
    toolRenderer(NoteEdit, {
      label: t.toolTextEdit, icon: <FilePenLine className="size-3.5" />,
      headerRenderer: ({ invocation, result }) => <ToolHeader label={t.toolTextEdit}
        subject={invocation.resource?.title}
        meta={result?.data && <>+{result.data.added} −{result.data.removed}</>} />,
      bodyRenderer: TextChangeBody,
    }),
    toolRenderer(NoteWrite, {
      label: t.toolTextWrite, icon: <FilePlus2 className="size-3.5" />,
      headerRenderer: ({ invocation, result }) => <ToolHeader label={t.toolTextWrite}
        subject={invocation.resource?.title}
        meta={result?.data && <>+{result.data.added} −{result.data.removed}</>} />,
      bodyRenderer: TextChangeBody,
    }),
  ],
} satisfies RendererModule;
