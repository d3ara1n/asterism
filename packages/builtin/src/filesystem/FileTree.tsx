import { Suspense, type ComponentType, type CSSProperties } from "react";
import { IslandPanel, useI18n, useRendererIsland, useRendererObject } from "@asterism-app/sdk/renderer";
import type { ResourceRef } from "@asterism-app/sdk/contracts";
import { FileTree } from "@pierre/trees/react";
import { RefreshCw } from "lucide-react";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { SearchInput } from "@asterism-app/ui/ui/search-input";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { cn } from "@asterism-app/ui/utils";
import { filesystemMessages } from "../messages/filesystem";
import type { TreeState, TreeStore } from "./tree-store";

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

/** Card body: edge-aligned filter bar + file tree; explanatory text fills empty-directory, no-match, and root-failure states. */
export function FileTreeBody({ store, state, FileView }: {
  store: TreeStore;
  state: TreeState;
  FileView: ComponentType<{ resource: ResourceRef; path: string }>;
}) {
  const i18n = useI18n();
  const island = useRendererIsland();
  const object = useRendererObject();
  const { model } = store;
  const openFile = (path: string, origin: HTMLElement) => {
    if (model.getItem(path)?.isDirectory() !== false) return;
    const resource = object.ref;
    void island.open({
      key: `file:${resource.sessionId}:${resource.id}:${path}`, label: path, size: "content", origin,
      render: () => <Suspense fallback={<IslandPanel title={path}><Spinner /></IslandPanel>}>
        <FileView key={path} resource={resource} path={path} />
      </Suspense>,
    });
  };
  const notice = state.error ? i18n.text(state.error)
    : state.empty ? i18n.formatMessage(filesystemMessages.toolDirectoryEmpty)
    : state.noMatches ? i18n.formatMessage(filesystemMessages.directoryNoMatches) : null;

  return <div className="nodrag nopan flex min-h-0 flex-1 flex-col">
    <div className="shrink-0 border-b">
      <SearchInput variant="inline" value={state.query} onChange={value => store.setFilter(value)}
        label={i18n.formatMessage(filesystemMessages.directorySearch)} />
    </div>
    {state.failure && !state.error && <p className="type-caption shrink-0 px-2 pt-1 text-destructive">{i18n.text(state.failure)}</p>}
    <div className="relative min-h-0 flex-1 pt-1">
      <div className={cn("h-full", notice && "invisible")}><FileTree model={model} style={treeStyle}
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
      {notice && <p className={cn("type-caption absolute inset-x-0 top-0 px-2 py-2", state.error && "text-destructive")}>{notice}</p>}
    </div>
  </div>;
}
