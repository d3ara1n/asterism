import { defineStorage } from "@asterism-app/sdk/runtime";

/** Storage entry point for the built-in plugin, with the same shape as an external plugin's manifest `asterism.storage`; imports no business runtime. */
export default defineStorage([
  { kind: "json", path: ".asterism/config.json", version: 2, migrations: {} },
  { kind: "sqlite", path: ".asterism/db.sqlite", version: 1, migrations: {} },
]);
