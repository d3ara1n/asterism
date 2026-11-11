import type { z } from "zod";
import type { DirectoryList } from "./contract.ts";

type ListEntry = z.infer<typeof DirectoryList.schema>["entries"][number];

const rank: Record<ListEntry["type"], number> = { directory: 0, file: 1, other: 2 };
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Listing order follows the file system; the view groups directories first, then files and special entries, each in natural name order. */
export function sortEntries<T extends ListEntry>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => rank[a.type] - rank[b.type] || collator.compare(a.name, b.name));
}

/** Resource-relative location of an entry inside the listed directory, where '.' denotes the root. */
export function entryPath(directory: string, name: string): string {
  const parent = directory.replace(/\/+$/u, "");
  return parent === "" || parent === "." ? name : `${parent}/${name}`;
}
