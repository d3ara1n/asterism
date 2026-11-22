import type { AsyncSubscription, Event } from "@parcel/watcher";
import { dirname, join, relative, sep } from "node:path";
import { directoryRoot, insideDirectory } from "./paths.ts";
import { discoverGitWorktree, type GitWorktree } from "./git-repository.ts";
import { readDirectoryStatus } from "./git-status.ts";
import type { DirectoryWatchEvent } from "./contract.ts";

/** Metadata affecting status or its HEAD baseline. Objects, logs and lock files are not status signals. */
const statusMetadata = new Set([
  "index", "HEAD", "packed-refs", "refs", "reftable", "config", "config.worktree", "info", "commondir",
  "MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "REBASE_HEAD", "rebase-merge", "rebase-apply", "sequencer",
]);

function gitDirectories(repository: GitWorktree | null | undefined): string[] {
  return repository ? [...new Set([repository.gitDir, repository.commonDir])] : [];
}
const samePath = (left: string, right: string) => relative(left, right) === "";

/** File events invalidate listings and Git independently; they are not Git status records. */
export function directoryInvalidation(root: string, repository: GitWorktree | null | undefined, events: readonly Pick<Event, "path" | "type">[]) {
  const metadata = gitDirectories(repository); // The worktree-specific directory precedes its common directory.
  const parents = new Set<string>();
  let git = false, discover = false;
  const marker = join(repository?.worktree ?? root, ".git");
  for (const event of events) {
    const path = event.path;
    if (samePath(root, path)) {
      parents.add("");
      git = true;
      discover ||= event.type !== "update";
      continue;
    }
    if (samePath(marker, path)) {
      git = true;
      discover ||= event.type !== "update" || !metadata.some(directory => samePath(directory, path));
      continue;
    }
    const directory = metadata.find(candidate => insideDirectory(candidate, path));
    if (directory) {
      const parts = relative(directory, path).split(sep);
      if (parts.at(-1)?.endsWith(".lock")) continue;
      const name = parts[0]!;
      if (!name || name === "commondir") { git = true; discover = true; }
      else if (statusMetadata.has(name)) git = true;
    } else if (insideDirectory(root, path)) {
      const parts = relative(root, path).split(sep);
      const dotGit = parts.indexOf(".git");
      if (dotGit >= 0 && dotGit < parts.length - 1) {
        // A nested repository can affect a gitlink; ignore its object and lock churn too.
        git ||= statusMetadata.has(parts[dotGit + 1]!);
        continue;
      }
      git = true;
      // The native watcher can coalesce a delete/recreate (including a change of entry kind) into an update.
      parents.add(relative(root, dirname(path)).split(sep).join("/"));
    }
  }
  return { parents: [...parents], git, discover };
}

/** A channel owns the native subscriptions and the serial Git reader, not the linked resource's lifetime. */
export function watchDirectory(path: string, signal: AbortSignal, send: (event: DirectoryWatchEvent) => void, report: (error: unknown) => void): () => void {
  const subscriptions = new Map<string, AsyncSubscription>();
  let root: string | undefined, repository: GitWorktree | null | undefined;
  let pending = false, rediscover = true, reading = false, watchFailed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function stop(subscription: AsyncSubscription) { void subscription.unsubscribe().catch(report); }
  signal.addEventListener("abort", () => {
    clearTimeout(timer);
    for (const subscription of subscriptions.values()) stop(subscription);
    subscriptions.clear();
  }, { once: true });

  async function ensureWatch(directory: string): Promise<void> {
    if (subscriptions.has(directory)) return;
    try {
      const { subscribe } = await import("@parcel/watcher");
      signal.throwIfAborted();
      const subscription = await subscribe(directory, (error, events) => {
        if (signal.aborted || !root) return;
        if (error) {
          const previous = subscriptions.get(directory);
          if (previous) { subscriptions.delete(directory); stop(previous); }
          failWatch(error);
          return;
        }
        const changes = directoryInvalidation(root, repository, events);
        if (changes.parents.length) send({ type: "filesChanged", parents: changes.parents });
        if (changes.discover || (changes.git && repository !== null)) request(changes.discover);
      }, { ignore: ["**/.git/{objects,logs,hooks}{,/**}", ...gitDirectories(repository)
        .flatMap(metadata => ["objects", "logs", "hooks"].map(child => join(metadata, child)))] });
      if (signal.aborted) stop(subscription);
      else subscriptions.set(directory, subscription);
    } catch (error) { failWatch(error); }
  }
  function failWatch(error: unknown) {
    if (signal.aborted) return;
    report(error);
    watchFailed = true;
    send({ type: "watchError" });
  }
  async function syncWatches(base: string) {
    const roots = [base, ...gitDirectories(repository).filter(directory => !insideDirectory(base, directory))];
    const watched = roots.filter(directory => samePath(directory, base)
      || !roots.some(parent => !samePath(parent, directory) && insideDirectory(parent, directory)));
    for (const [directory, subscription] of subscriptions) {
      if (!watched.includes(directory)) { subscriptions.delete(directory); stop(subscription); }
    }
    await Promise.all(watched.filter(directory => directory !== base).map(ensureWatch));
    if (watchFailed && !signal.aborted && watched.every(directory => subscriptions.has(directory))) {
      watchFailed = false;
      send({ type: "watchReady" });
    }
  }
  async function read() {
    reading = true;
    while (pending && !signal.aborted) {
      pending = false;
      const locate = rediscover;
      rediscover = false;
      send({ type: "gitReading" });
      try {
        if (locate || !root || repository === undefined) {
          repository = undefined;
          root = await directoryRoot(path);
          await ensureWatch(root);
          try { repository = await discoverGitWorktree(root, signal); }
          finally { if (!signal.aborted) await syncWatches(root); }
        }
        const summary = repository ? await readDirectoryStatus(root, repository, signal) : null;
        if (!signal.aborted) send({ type: "gitStatus", summary });
      } catch (error) {
        if (!signal.aborted) { report(error); send({ type: "gitError" }); }
      }
    }
    reading = false;
  }
  function request(locate = false, immediate = false) {
    if (signal.aborted) return;
    rediscover ||= locate;
    if (immediate) {
      clearTimeout(timer);
      timer = undefined;
      pending = true;
      if (!reading) void read();
    } else if (timer === undefined) timer = setTimeout(() => {
      timer = undefined;
      pending = true;
      if (!reading) void read();
    }, 1000);
  }
  request(true, true);
  return () => request(true, true);
}
