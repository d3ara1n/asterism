import { noteCard } from "../shared/card-appearance.ts";
import { defineModule, implementResource, implementCreation, implementTool, PluginApiError, type ObjectReader, type ObjectExecutor, type CallResult } from "@asterism/sdk/runtime";
import { Note, CreateNote, NoteContent, NoteView, NoteRead, NoteEdit, NoteWrite, MAX_NOTE_LENGTH } from "./contract.ts";
import { TextError, readText, readToModel, editText, textChange, writeToModel, editToModel } from "../shared/text.ts";

function currentContent(object: ObjectReader) {
  try { return object.get(NoteContent); }
  catch (error) {
    if (error instanceof PluginApiError && error.code === "unavailable") return null;
    throw error;
  }
}
function requireText(object: ObjectReader): string {
  const content = currentContent(object);
  if (content === null) throw new TextError("note_unavailable", "This note's current content is unavailable.");
  return content.text;
}
function titleOf(object: ObjectReader): string {
  const resource = object.snapshot();
  if (!resource) throw new PluginApiError("unavailable", "The note is not available on this session path.");
  return resource.title;
}
function save(object: ObjectExecutor, text: string): void {
  object.commit(writer => { writer.set(NoteContent, { text }); });
}
function validateNoteText(text: string): void {
  if (text.length > MAX_NOTE_LENGTH) throw new TextError("note_too_large", `Note content exceeds ${MAX_NOTE_LENGTH} UTF-16 code units.`);
}
function mutationFailure(error: unknown, signal: AbortSignal, operation: string): CallResult<never> {
  if (error instanceof TextError) return error.outcome();
  if (signal.aborted) return { kind: "cancelled", message: `${operation} was cancelled before saving.` };
  throw error;
}

/** Notes save only the current mutable body; cursor rewind does not restore the body. */
export default defineModule(() => ({
  resources: [implementResource(Note, NoteView, {
    card: noteCard,
    creation: implementCreation(CreateNote, {
      create({ title, content }, object) {
        save(object, content);
        return { title, data: {} };
      },
    }),
    project: (_data, object) => ({ text: currentContent(object)?.text ?? null }),
    async inspect(_data, object) {
      const content = currentContent(object);
      return { type: Note.kind, title: titleOf(object), available: content !== null,
        length: content?.text.length ?? null, maxLength: MAX_NOTE_LENGTH };
    },
  })],
  tools: [
    implementTool(NoteRead, {
      async call(_data, _target, args, { object, signal }) {
        try {
          signal.throwIfAborted();
          return { kind: "succeeded", data: readText(requireText(object), args.anchored !== false) };
        } catch (error) { if (error instanceof TextError) return error.outcome(); throw error; }
      },
      toModel: readToModel,
    }),
    implementTool(NoteEdit, {
      async call(_data, _target, args, { object, signal }) {
        try {
          signal.throwIfAborted();
          const before = requireText(object);
          const edited = editText(before, args.edits);
          validateNoteText(edited.text);
          const data = textChange(before, edited.text, titleOf(object), edited.touchedLines);
          signal.throwIfAborted();
          save(object, edited.text);
          return { kind: "succeeded", data };
        } catch (error) { return mutationFailure(error, signal, "Note editing"); }
      },
      toModel: editToModel,
    }),
    implementTool(NoteWrite, {
      async call(_data, _target, args, { object, signal }) {
        try {
          signal.throwIfAborted();
          validateNoteText(args.content);
          const before = requireText(object);
          const data = textChange(before, args.content, titleOf(object));
          signal.throwIfAborted();
          if (data.changed) save(object, args.content);
          return { kind: "succeeded", data };
        } catch (error) { return mutationFailure(error, signal, "Note writing"); }
      },
      toModel: writeToModel,
    }),
  ],
}));
