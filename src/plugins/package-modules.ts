import { fileURLToPath } from "node:url";

/** Rewrite archive segments to the physical unpacked tree for an OS consumer. */
export function unpackedArchivePath(entry: string): string | null {
  const segments = entry.split(/[\\/]/u);
  let archive = -1;
  for (let index = 0; index < segments.length; index += 1) if (segments[index]!.endsWith(".asar")) archive = index;
  if (archive < 0) return null;
  const separator = entry.match(/[\\/]/u)?.[0] ?? "/";
  return [...segments.slice(0, archive), `${segments[archive]}.unpacked`, ...segments.slice(archive + 1)].join(separator);
}
/** Keep this depth: bundled main/runtime entries live in out/<realm>, two levels below the application root. */
export function applicationDirectory(path: string): string {
  return fileURLToPath(new URL(`../../${path}/`, import.meta.url));
}
