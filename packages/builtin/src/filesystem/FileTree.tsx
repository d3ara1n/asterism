import { lazy, Suspense, type CSSProperties, type ReactNode } from "react";
import { useI18n, useRendererResourceNavigation, useRendererObject, useRendererIsland, IslandPanel } from "@asterism-app/sdk/renderer";
import { FileTree } from "@pierre/trees/react";
import { CircleCheck, GitCompare, RefreshCw } from "lucide-react";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { ToggleGroup, ToggleGroupItem } from "@asterism-app/ui/ui/toggle-group";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { Empty, EmptyHeader, EmptyMedia, EmptyDescription } from "@asterism-app/ui/ui/empty";
import { SearchInput } from "@asterism-app/ui/ui/search-input";
import { cn } from "@asterism-app/ui/utils";
import { filesystemMessages } from "../messages/filesystem";
import type { TreeState, TreeStore } from "./tree-store";

const DirectoryDiff = lazy(() => import("./DirectoryDiff"));

/** Header actions: working-tree line changes against HEAD, when any, and a refresh of loaded directories. */
export function FileTreeActions({ store, state }: { store: TreeStore; state: TreeState }) {
  const i18n = useI18n();
  const busy = state.loading || state.refreshing;
  return <>
    {state.changes && <span className="type-caption flex items-center gap-1 tabular-nums">
      <span className="sr-only">{i18n.formatMessage(filesystemMessages.directoryChanges, state.changes)}</span>
      <span aria-hidden className="text-success">+{state.changes.added}</span>
      <span aria-hidden className="text-destructive">−{state.changes.removed}</span>
    </span>}
    <IconButton size="icon-xs" label={i18n.text(filesystemMessages.directoryRefresh)} disabled={busy} onClick={() => void store.refresh()}>
      <RefreshCw className={cn(busy && "animate-spin")} />
    </IconButton>
  </>;
}

/**
 * File-tree appearance maps to public tokens: row backgrounds are inset rounded blocks (matching sidebar lists), with icons and text aligned respectively
 * to the title bar's icon column (12px) and name column (36px). Horizontal spacing is 6px scroll-area padding + 2px row margin + 4px row padding.
 */
const treeStyle = {
  height: "100%",
  "--trees-bg-override": "var(--card)",
  "--trees-fg-override": "var(--card-foreground)",
  "--trees-fg-muted-override": "var(--muted-foreground)",
  "--trees-bg-muted-override": "var(--accent)",
  "--trees-selected-bg-override": "var(--selected)",
  "--trees-selected-fg-override": "var(--selected-foreground)",
  "--trees-selected-focused-border-color-override": "transparent",
  "--trees-focus-ring-color-override": "var(--ring)",
  "--trees-indent-guide-bg-override": "var(--border)",
  "--trees-border-radius-override": "calc(var(--radius) - 2px)",
  "--trees-font-family-override": "var(--font-sans)",
  "--trees-font-size-override": "0.875rem",
  "--trees-padding-inline-override": "8px",
  "--trees-item-padding-x-override": "4px",
  "--trees-item-row-gap-override": "8px",
} as CSSProperties;

/** Compact segment inside the filter bar; the selected segment is raised against the muted track. */
const viewItem = "h-6 min-w-0 gap-1 rounded-sm px-2 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-xs";

/** Card body: edge-aligned filter bar + file tree; explanatory text fills empty-directory, no-match, and root-failure states. */
export function FileTreeBody({ store, state }: {
  store: TreeStore;
  state: TreeState;
}) {
  const i18n = useI18n();
  const navigation = useRendererResourceNavigation();
  const object = useRendererObject();
  const island = useRendererIsland();
  const changes = state.mode === "changes" ? store.changeTree : undefined;
  const changing = changes !== undefined;
  const model = changes?.model ?? store.model;
  const openFile = (path: string, origin: HTMLElement) => {
    if (model.getItem(path)?.isDirectory() !== false) return;
    if (changing) {
      const entry = changes?.entry(path);
      if (!entry || entry.path.endsWith("/")) return;
      void island.open({ key: `diff:${object.ref.sessionId}:${object.ref.id}:${entry.path}`, label: entry.path, size: "content", origin,
        render: () => <Suspense fallback={<IslandPanel title={entry.path}><Spinner /></IslandPanel>}>
          <DirectoryDiff resource={object.ref} path={entry.path} store={store} />
        </Suspense> });
    } else void navigation.open(object.ref, path, { origin });
  };
  // A Changes view with nothing to list replaces the tree with a centered state.
  const blank: { icon: ReactNode; label: string } | null = !changing || state.loading ? null
    : state.git === null ? { icon: <GitCompare />, label: i18n.text(filesystemMessages.notRepository) }
    : state.git?.files.length === 0 ? { icon: <CircleCheck />, label: i18n.text(filesystemMessages.noChanges) }
    : null;
  const notice = changing
    ? !blank && !state.loading && state.changeNoMatches ? i18n.text(filesystemMessages.directoryNoMatches) : null
    : state.error ? i18n.text(state.error)
      : state.empty ? i18n.text(filesystemMessages.toolDirectoryEmpty)
      : state.noMatches ? i18n.text(filesystemMessages.directoryNoMatches) : null;

  return <div className="nodrag nopan flex min-h-0 flex-1 flex-col">
    {/* One edge-aligned bar: the filter fills the row, and the view switch is a compact segmented control at its end. */}
    <div className="flex shrink-0 items-center border-b">
      <div className="min-w-0 flex-1">
        <SearchInput variant="inline" value={state.query} onChange={value => store.setFilter(value)}
          label={i18n.formatMessage(filesystemMessages.directorySearch)} />
      </div>
      {store.changeTree && <ToggleGroup type="single" spacing={0.5} value={state.mode} aria-label={i18n.text(filesystemMessages.viewLabel)}
        className="mr-2 shrink-0 rounded-md bg-muted p-0.5"
        onValueChange={value => { if (value === "files" || value === "changes") store.setMode(value); }}>
        <ToggleGroupItem value="files" className={viewItem}>{i18n.text(filesystemMessages.filesView)}</ToggleGroupItem>
        <ToggleGroupItem value="changes" className={viewItem}>{i18n.text(filesystemMessages.changesView)}
          {state.git && state.git.files.length > 0 && <span className="tabular-nums text-muted-foreground">{state.git.files.length}</span>}
        </ToggleGroupItem>
      </ToggleGroup>}
    </div>
    {state.watchFailure && <p role="status" className="type-caption shrink-0 px-2 pt-1 text-destructive">{i18n.text(state.watchFailure)}</p>}
    {state.failure && (changing || !state.error) && <p className="type-caption shrink-0 px-2 pt-1 text-destructive">{i18n.text(state.failure)}</p>}
    <div className="relative min-h-0 flex-1 pt-1">
      <div className={cn("h-full", (notice || blank) && "invisible")}><FileTree key={state.mode} model={model} style={treeStyle}
        onClick={event => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          const row = event.nativeEvent.composedPath().find((node): node is HTMLElement => node instanceof HTMLElement && !!node.dataset.itemPath);
          if (row) openFile(row.dataset.itemPath!, row);
        }}
        onKeyDownCapture={event => {
          if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
          const item = model.getFocusedItem();
          if (!item || item.isDirectory()) return;
          event.preventDefault(); event.stopPropagation();
          const row = event.nativeEvent.composedPath().find((node): node is HTMLElement => node instanceof HTMLElement && !!node.dataset.itemPath);
          openFile(item.getPath(), row ?? event.currentTarget);
        }} /></div>
      {blank && <Empty className="pointer-events-none absolute inset-0 p-6">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="text-muted-foreground">{blank.icon}</EmptyMedia>
          <EmptyDescription className="text-xs">{blank.label}</EmptyDescription>
        </EmptyHeader>
      </Empty>}
      {notice && <p className={cn("type-caption absolute inset-x-0 top-0 px-2 py-2", state.error && "text-destructive")}>{notice}</p>}
    </div>
  </div>;
}
