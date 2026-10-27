import { defineStorage } from "@asterism/sdk/runtime";

/** Storage entry point for the built-in plugin, with the same shape as an external plugin's manifest `asterism.storage`; imports no business runtime. */
export default defineStorage([
  { kind: "json", path: ".asterism/config.json", version: 1, migrations: {} },
]);
