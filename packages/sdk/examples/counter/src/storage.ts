import { defineStorage } from "@asterism-app/sdk/runtime";
export default defineStorage([
  { kind: "json", path: ".asterism/config.json", version: 1, migrations: {} },
]);
