import { z } from "zod";
import { defineStorage } from "@asterism/sdk/runtime";

/**
 * Storage entry point: `"asterism": { "storage": "./src/storage.ts" }` in package.json points to this file.
 * The host imports it separately before the plugin runtime, depending only on the format declarations themselves; each step interprets only the historical shape it receives.
 */
export default defineStorage([
  {
    // Managed configuration: `plugin.config` handles the `{ version, data }` envelope on reads and writes, while the plugin still consumes configuration values.
    kind: "json", path: ".asterism/config.json", version: 2,
    migrations: {
      1: raw => {
        const old = z.object({ greeting: z.string() }).parse(raw);
        return { ...old, enabled: true };
      },
    },
  },
  {
    // Managed database: the host writes the current `user_version` on initial creation; migrations execute synchronous SQL within a host transaction.
    kind: "sqlite", path: ".asterism/db.sqlite", version: 2,
    migrations: {
      1: db => db.exec("ALTER TABLE notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;"),
    },
  },
]);
