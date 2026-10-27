import { creationEntry, type RendererObjectContext } from "@asterism-app/sdk/renderer";
import { CreateDocument, ReplaceDocument } from "./content-contract.ts";

/** This entry point accepts dropped files (with or without local paths) and clipboard images on the workbench. */
export const importDocument = creationEntry(CreateDocument, {
  id: "example.content/import", label: "Import document",
  triggers: { drop: {
    accepts: { files: {} },
    async toInput(item, content) {
      if (item.kind !== "file" || item.directory) return null;
      return { file: await content.stage(item.file), name: item.name };
    },
  } },
});

/** The host closes the draft after a successful command; failure preserves it for retry, and abandoning it calls close. */
export function replacementInput(object: RendererObjectContext) {
  const draft = object.input(ReplaceDocument);
  return {
    async submit(file: File) {
      const ref = await draft.stage(file);
      return object.invoke(ReplaceDocument, { file: ref, name: file.name }, { content: draft });
    },
    cancel: () => draft.close(),
  };
}
