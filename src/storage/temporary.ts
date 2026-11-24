import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { applicationDataDirectory, applicationSlug } from "../shared/application.ts";

/** Disposable files share one system-temp root; development workspaces have their own subtree. */
export function applicationTempRoot(dataRoot?: string): string {
  const uid = process.platform === "linux" ? process.getuid?.() : undefined;
  const root = join(tmpdir(), uid === undefined ? applicationSlug : `${applicationSlug}-${uid}`);
  return dataRoot && basename(dataRoot) === applicationDataDirectory(false) ? join(root, "dev") : root;
}
