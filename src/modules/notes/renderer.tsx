import { FileText } from "lucide-react";
import { cardRenderer, resultRenderer, type RendererModule } from "../../renderer/modules/registry";
import { t } from "../../renderer/shared/i18n";
import { NoteView, NoteRead } from "./contract";

export default {
  cards: [cardRenderer(NoteView, {
    label: t.kindNote, icon: <FileText className="size-4" />, width: 340, connection: "source",
    Body: ({ data }) => <div className="max-h-80 select-text overflow-auto p-3">
      {data.text !== null ? <p className="type-body whitespace-pre-wrap break-words">{data.text}</p>
        : <p className="type-body text-muted-foreground">{t.contentUnavailable}</p>}
    </div>,
  })],
  results: [resultRenderer(NoteRead, ({ data }) =>
    <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-sm">{data.text}</pre>)],
} satisfies RendererModule;
