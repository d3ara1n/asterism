import { defineModule, definePlugin, implementAction, implementCreation, implementResource, type ObjectReader } from "@asterism-app/sdk/runtime";
import { CreateDocument, Document, DocumentContent, Imported, ReplaceDocument, files } from "../examples/content-contract.ts";

export function rejectReadOnlyStaging(object: ObjectReader) {
  // @ts-expect-error The read facade cannot stage content.
  void object.content.stage(new Uint8Array());
}
