import { useState } from "react";
import { useRendererCalls } from "@asterism-app/sdk/renderer";
import type { ResourceRef } from "@asterism-app/sdk/contracts";
import { EditorIsland } from "../editor/EditorIsland";
import { parseEditorText, serializeEditorText } from "../editor/text-format";
import { SaveNoteText } from "./contract";

export default function NoteEditor({ resource, title, text }: { resource: ResourceRef; title: string; text: string }) {
  const calls = useRendererCalls();
  const [initial] = useState(() => parseEditorText(text));
  return <EditorIsland title={title} filename="note.md" text={initial.content}
    onSave={async content => {
      await calls.invoke(SaveNoteText, { text: serializeEditorText(content, initial.format) }, { object: resource });
    }} />;
}
