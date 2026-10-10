import { z } from "zod";
import { implementResource } from "../../resources/contract.ts";
import { implement } from "../../tools/contract.ts";
import { defineModule } from "../../plugins/contract.ts";
import { Note, NoteView, NoteRead, NoteEdit, NoteWrite } from "./contract.ts";
import { TextError, readText, readToModel, editText, textChange, changeToModel } from "../../tools/text.ts";

const MAX_NOTE_LENGTH = 100_000;
const contentKey = "note.content";
const currentContent = z.strictObject({ text: z.string().max(MAX_NOTE_LENGTH) });
const noteCreate = z.strictObject({ title: z.string().trim().min(1).max(160).default("Untitled note"), content: z.string().max(MAX_NOTE_LENGTH).default("") });

function validateNoteText(text: string): void {
  if (text.length > MAX_NOTE_LENGTH) throw new TextError("note_too_large", `Note content exceeds ${MAX_NOTE_LENGTH} UTF-16 code units. Shorten the content before retrying.`);
}

/** 笔记只保存当前可变正文；任何历史位置的卡片与读取都取用此状态。 */
export default defineModule(plugin => {
  const { state } = plugin;
  const get = (objectId: string) => currentContent.safeParse(state.get(objectId, contentKey));
  const requireText = (objectId: string): string => {
    const parsed = get(objectId);
    if (!parsed.success) throw new TextError("note_unavailable", "This note's current content is unavailable. Ask the user to restore or recreate the note; do not overwrite it by assuming empty content.");
    return parsed.data.text;
  };
  const save = (objectId: string, text: string) => {
    plugin.session(state.update(objectId, contentKey, { text })).changed();
  };
  return {
    resources: [implementResource(Note, NoteView, {
      project: (_state, resource) => {
        const content = get(resource.id);
        return { text: content.success ? content.data.text : null };
      },
      async inspect(_state, resource) {
        const content = get(resource.id);
        return { type: Note.kind, title: resource.title, available: content.success,
          length: content.success ? content.data.text.length : null, maxLength: MAX_NOTE_LENGTH };
      },
      controller: {
        create(sessionId, objectId, input) {
          const { title, content } = noteCreate.parse(input);
          plugin.object(sessionId, objectId).set(contentKey, { text: content });
          return { title };
        },
      },
    })],
    tools: [
      implement(NoteRead, {
        async call(_state, _target, args, { resource, signal }) {
          try {
            signal.throwIfAborted();
            return { kind: "succeeded", data: readText(requireText(resource.id), args.anchored !== false) };
          } catch (error) { if (error instanceof TextError) return error.outcome(); throw error; }
        },
        toModel: readToModel,
      }),
      implement(NoteEdit, {
        async call(_state, _target, args, { resource, signal }) {
          try {
            signal.throwIfAborted();
            const before = requireText(resource.id);
            const edited = editText(before, args.edits);
            validateNoteText(edited.text);
            const data = textChange(before, edited.text, resource.title, edited.touchedLines);
            signal.throwIfAborted();
            save(resource.id, edited.text);
            return { kind: "succeeded", data };
          } catch (error) { if (error instanceof TextError) return error.outcome(); if (signal.aborted) return { kind: "cancelled", message: "Note editing was cancelled before saving." }; throw error; }
        },
        toModel: changeToModel,
      }),
      implement(NoteWrite, {
        async call(_state, _target, args, { resource, signal }) {
          try {
            signal.throwIfAborted();
            validateNoteText(args.content);
            const before = requireText(resource.id);
            const data = textChange(before, args.content, resource.title);
            signal.throwIfAborted();
            if (data.changed) save(resource.id, args.content);
            return { kind: "succeeded", data };
          } catch (error) { if (error instanceof TextError) return error.outcome(); if (signal.aborted) return { kind: "cancelled", message: "Note writing was cancelled before saving." }; throw error; }
        },
        toModel: changeToModel,
      }),
    ],
  };
});
