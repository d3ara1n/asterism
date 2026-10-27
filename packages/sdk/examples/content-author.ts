import { defineModule, definePlugin, implementAction, implementCreation, implementResource } from "@asterism-app/sdk/runtime";
import { CreateDocument, Document, DocumentContent, Imported, ReplaceDocument, files } from "./content-contract.ts";

/** The session owns content, and plugins only interpret business formats; this example does not access host source code or private paths. */
export default definePlugin({ namespace: files, modules: [defineModule(() => ({
  resources: [implementResource(Document, DocumentContent, {
    records: [Imported],
    creation: implementCreation(CreateDocument, {
      async prepare(input, { content }) {
        // Format checks can read a bounded range or use open to stream large files.
        await content.read(input.file, { length: 512 });
        return { action: "accept" };
      },
      create(input, object) {
        object.commit(writer => {
          writer.set(DocumentContent, input);
          // This example explicitly retains the originally imported content; resources that store only the current value can omit this event.
          writer.append(Imported, input);
        });
        return { title: input.name, data: {} };
      },
    }),
    actions: [implementAction(ReplaceDocument, {
      async execute(input, object) { object.commit(writer => { writer.set(DocumentContent, input); }); },
    })],
    project: (_data, object) => object.get(DocumentContent)!,
    inspect: async (_data, object) => object.get(DocumentContent),
  })],
}))] });
