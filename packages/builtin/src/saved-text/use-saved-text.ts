import { nanoid } from "nanoid";
import { useRendererConfiguration } from "@asterism-app/sdk/renderer";
import { BuiltinSettings, type SavedText } from "../settings/contract.ts";

export type SavedTextValue = Pick<SavedText, "name" | "content">;

const nameLength = 48;

/** Name a saved text after the first non-blank line of its content, truncated by code point. */
export function savedTextName(content: string): string {
  const line = content.split("\n").map(part => part.trim()).find(Boolean) ?? "";
  const chars = Array.from(line);
  return chars.length > nameLength ? `${chars.slice(0, nameLength - 1).join("")}…` : line;
}

/** User-authored text shared by settings and Agent composers. */
export function useSavedText() {
  const config = useRendererConfiguration(BuiltinSettings);
  const items = config.value.savedText;
  return {
    items,
    ready: config.ready,
    error: config.error,
    status: config.status,
    refresh: config.refresh,
    /** Create when id is absent; resolves to the stored identity. */
    async save(value: SavedTextValue, id?: string): Promise<string> {
      const target = id ?? nanoid();
      await config.save({ ...config.value, savedText: id === undefined
        ? [...items, { id: target, ...value }]
        : items.map(item => item.id === id ? { ...item, ...value } : item) });
      return target;
    },
    remove: (id: string) => config.save({ ...config.value, savedText: items.filter(item => item.id !== id) }),
  };
}
