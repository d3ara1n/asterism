import { z } from "zod";
import { contentRefSchema, defineAction, defineCreation, defineRecord, pluginNamespace } from "@asterism/sdk/contracts";

/** Content identities can be embedded in ordinary contracts; authors need not declare a separate list of persistent attachments. */
export const files = pluginNamespace("example.content");
export const Document = files.resource("document", z.object({}));
export const DocumentContent = files.data("content", z.object({ file: contentRefSchema, name: z.string() }));
export const Imported = defineRecord(files.name("imported"), { schema: DocumentContent.schema });
export const CreateDocument = defineCreation(Document, { id: files.name("create"), schema: DocumentContent.schema });
export const ReplaceDocument = defineAction(Document, { id: files.name("replace"), schema: DocumentContent.schema });
