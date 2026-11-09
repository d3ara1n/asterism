import type { AsyncSubscription, Event } from "@parcel/watcher";
import { join, relative, sep } from "node:path";
import { directoryRoot, insideDirectory } from "./paths.ts";
import { git, insideWorkTree } from "./git.ts";
import type { DirectoryWatchEvent } from "./contract.ts";

/** Metadata that can change status or its comparison baseline; object storage is not a status signal. */
const statusMetadata = new Set([
  "index", "HEAD", "packed-refs", "refs", "config", "config.worktree", "info", "commondir",
  "MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "REBASE_HEAD", "rebase-merge", "rebase-apply", "sequencer",
]);
function relevantMetadata(path: string): boolean {
  return path === "" || statusMetadata.has(path.split("/")[0]!);
}

/** Events are invalidation signals, not an audit log or Git status records. */
export function directoryChanged(root: string, gitDirectories: readonly string[], events: readonly Pick<Event, "path">[]): boolean {
  return events.some(event => {
    const gitDirectory = gitDirectories.find(directory => insideDirectory(directory, event.path));
    return gitDirectory
      ? relevantMetadata(relative(gitDirectory, event.path).split(sep).join("/"))
      : insideDirectory(root, event.path);
  });
}

/** A frontend channel owns the native subscriptions; background resource/agent lifetimes do not start watches. */
export async function watchDirectory(path: string, signal: AbortSignal, send: (event: DirectoryWatchEvent) => void,
  fail: (error: unknown) => void, cleanupFailed: (error: unknown) => void): Promise<void> {
  const root = await directoryRoot(path);
  let gitDirectories: string[] = [];
  if (await insideWorkTree(root, signal)) {
    const locations = await Promise.all([
      git(root, ["rev-parse", "--absolute-git-dir"], signal),
      git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"], signal),
    ]);
    gitDirectories = [...new Set(locations.map(value => value.replace(/\r?\n$/, "")))];
  }
  signal.throwIfAborted();
  const { subscribe } = await import("@parcel/watcher");
  signal.throwIfAborted();
  const subscriptions: AsyncSubscription[] = [];
  const close = () => {
    for (const subscription of subscriptions.splice(0)) void subscription.unsubscribe().catch(cleanupFailed);
  };
  signal.addEventListener("abort", close, { once: true });
  // Worktree-contained metadata shares the recursive subscription; linked-worktree metadata can live elsewhere.
  const candidates = [root, ...gitDirectories];
  const roots = candidates.filter(directory => !candidates.some(parent => parent !== directory && insideDirectory(parent, directory)));
  const ignore = gitDirectories.flatMap(directory => ["objects", "logs", "hooks"].map(child => join(directory, child)));
  for (const directory of roots) {
    const subscription = await subscribe(directory, (error, events) => {
      if (signal.aborted) return;
      if (error) { fail(error); return; }
      if (directoryChanged(root, gitDirectories, events)) send({ type: "changed" });
    }, { ignore });
    if (signal.aborted) { await subscription.unsubscribe(); return; }
    subscriptions.push(subscription);
  }
  if (!signal.aborted) send({ type: "ready" });
}
