import { z } from "zod";
import { defineCreation, pluginNamespace } from "@asterism/sdk/contracts";
import { definePlugin, implementCreation, implementResource } from "@asterism/sdk/runtime";
import { defineAgentCreation } from "@asterism/builtin-api/runtime";

const ns = pluginNamespace("example.documents");
const Document = ns.resource("document", z.object({ text: z.string() }));
const View = ns.data("view", z.object({ text: z.string() }));
export const CreateDocument = defineCreation(Document, { id: ns.name("create"),
  schema: z.object({ title: z.string().min(1), text: z.string().default("") }),
});

export default definePlugin({
  namespace: ns, version: "1.0.0",
  setup() {
    return {
      resources: [implementResource(Document, View, {
        creation: implementCreation(CreateDocument, { create: input => ({ title: input.title, data: { text: input.text } }) }),
        project: data => data,
        inspect: async data => data,
      })],
      modules: [
        // Reuse the creation contract directly without copying the schema.
        defineAgentCreation({ id: ns.name("document"), description: "Create a document.", creation: CreateDocument }),
        // The same resource type can provide another model entry point that hides or transforms internal parameters.
        defineAgentCreation({
          id: ns.name("quick-note"), description: "Create a document from a short note.", creation: CreateDocument,
          inputSchema: z.object({ note: z.string().min(1).describe("The note text.") }),
          toInput: ({ note }) => ({ title: note.slice(0, 60), text: note }),
        }),
      ],
    };
  },
});
