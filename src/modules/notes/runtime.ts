import { implementResource } from "../../resources/contract.ts";
import { implement } from "../../tools/contract.ts";
import type { RuntimeModuleFactory } from "../runtime-contract.ts";
import { Note, NoteRead, NoteView } from "./contract.ts";

export default (({ objects }) => ({
  resources: [implementResource(Note, NoteView, {
    project: state => ({ text: objects.get(state.contentRef) }),
    async inspect(state, resource) {
      const text = objects.get(state.contentRef);
      return { type: Note.kind, title: resource.title, available: text !== null, length: text?.length ?? null };
    },
  })],
  tools: [implement(NoteRead, {
    async call(state) {
      const text = objects.get(state.contentRef);
      return text === null
        ? { kind: "failed", error: { code: "object_missing", message: "The note content is unavailable." } }
        : { kind: "succeeded", data: { text } };
    },
  })],
})) satisfies RuntimeModuleFactory;
