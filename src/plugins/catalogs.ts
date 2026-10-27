import { parse } from "@formatjs/icu-messageformat-parser";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { resolve, relative, isAbsolute, sep } from "node:path";

import { canonicalLocale, type TranslationCatalog } from "../shared/i18n.ts";

function inside(base: string, file: string): boolean {
  const path = relative(base, file);
  return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

/** Static catalog reads are independent of business assembly; normalized and real paths remain inside package roots. */
export function loadCatalogs(
  root: string,
  owner: string,
  entries: Record<string, string>,
  diagnose: (message: string) => void = console.warn,
): TranslationCatalog[] {
  const catalogs: TranslationCatalog[] = [];
  const seen = new Set<string>();
  for (const [tag, path] of Object.entries(entries)) {
    try {
      const locale = canonicalLocale(tag);
      if (!locale || seen.has(locale)) throw new Error("Invalid or duplicate language tag.");
      seen.add(locale);
      const file = resolve(root, path);
      if (!inside(resolve(root), file) || !inside(realpathSync(root), realpathSync(file))) {
        throw new Error("Catalog path is outside the package.");
      }
      const raw = readFileSync(file, "utf8");
      const data: unknown = JSON.parse(raw);
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Catalog must contain an object.");
      const messages: Record<string, string> = {};
      for (const [id, message] of Object.entries(data)) {
        try {
          if (typeof message !== "string" || !message.trim()) throw new Error("Invalid message.");
          parse(message);
          messages[id] = message;
        } catch {
          diagnose(`Invalid catalog message: ${owner}/${id} (${locale}).`);
        }
      }
      catalogs.push({ owner, locale, revision: createHash("sha256").update(raw).digest("hex"), messages });
    } catch (error) {
      diagnose(`Catalog could not be loaded: ${owner}/${tag}. ${error instanceof Error ? error.message : "Invalid catalog."}`);
    }
  }
  return catalogs;
}
