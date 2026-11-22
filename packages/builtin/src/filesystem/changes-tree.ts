import { FileTree } from "@pierre/trees";
import { buildChanges, type ChangeEntry } from "./changes-model.ts";
import { diffPaths } from "./tree-model.ts";

/** Directory-only projection of Git entries; summary directories remain terminal model leaves. */
export class ChangesTree {
  readonly model = new FileTree({
    paths: [], initialExpansion: "closed", flattenEmptyDirectories: false, itemHeight: 28,
    icons: { set: "complete", colored: false }, fileTreeSearchMode: "hide-non-matches",
    renderRowDecoration: ({ item }) => this.entries.get(item.path)?.path.endsWith("/") ? { text: "/" } : null,
  });
  private entries = new Map<string, ChangeEntry>();
  private paths: string[] = [];

  entry(path: string) { return this.entries.get(path); }

  update(files: readonly ChangeEntry[]) {
    const tree = buildChanges(files);
    this.entries = tree.entries;
    this.model.batch(diffPaths(this.paths, tree.paths));
    this.paths = tree.paths;
    this.model.setGitStatus([...tree.entries].map(([path, entry]) => ({ path, status: entry.status })));
  }

  /** Return whether a nonempty changes list has no matches for the current filter. */
  filter(query: string): boolean {
    const value = query.trim();
    this.model.setSearch(value || null);
    return this.entries.size > 0 && value !== "" && this.model.getSearchMatchingPaths().length === 0;
  }

  dispose() { this.model.cleanUp(); }
}
