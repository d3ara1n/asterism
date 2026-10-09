import { implementResource } from "../../resources/contract.ts";
import { implement } from "../../tools/contract.ts";
import type { RuntimeModuleFactory } from "../runtime-contract.ts";
import { z } from "zod";
import { Note, NoteRead, NoteView } from "./contract.ts";

/** 新笔记可先无正文，直接落卡后再编辑。 */
const noteCreate = z.strictObject({ title: z.string().trim().min(1).max(160).default("Untitled note"), content: z.string().max(100_000).default("") });

export default (({ objects }) => ({
  resources: [implementResource(Note, NoteView, {
    project: state => ({ text: objects.get(state.contentRef) }),
    async inspect(state, resource) {
      const text = objects.get(state.contentRef);
      return { type: Note.kind, title: resource.title, available: text !== null, length: text?.length ?? null };
    },
    controller: {
      create(_sessionId, _objectId, input) {
        const { title, content } = noteCreate.parse(input);
        return { title, data: { contentRef: objects.put(content) } };
      },
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
