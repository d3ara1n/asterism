import { FileText } from "lucide-react";
import { cardRenderer, type RendererModule } from "../../renderer/modules/registry";
import { t } from "../../renderer/shared/i18n";
import { NoteView } from "./contract";

export default {
  resources: [{ kind: "note", label: t.kindNote, icon: <FileText className="size-4" /> }],
  cards: [cardRenderer(NoteView, {
    width: 340,
    Body: ({ data }) => <div className="max-h-80 select-text overflow-auto p-3">
      {data.text !== null ? <p className="type-body whitespace-pre-wrap break-words">{data.text}</p>
        : <p className="type-body text-muted-foreground">{t.contentUnavailable}</p>}
    </div>,
  })],
  tools: [],
} satisfies RendererModule;
