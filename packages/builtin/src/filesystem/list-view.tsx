import { useI18n, useRendererObject, useRendererResourceNavigation, useRendererViewState, type ToolRenderProps } from "@asterism-app/sdk/renderer";
import type { z } from "zod";
import { File, FileQuestion, Folder } from "lucide-react";
import { ToolHeader } from "@asterism-app/ui/tool-header";
import { useToolResourceSubject } from "@asterism-app/ui/tool-content";
import { Button } from "@asterism-app/ui/ui/button";
import { cn } from "@asterism-app/ui/utils";
import { filesystemMessages } from "../messages/filesystem";
import { inputText } from "../shared/tool-preview";
import { TOOL_BODY_LINE_LIMIT } from "../shared/tool-body";
import { DirectoryList } from "./contract";
import { entryPath, sortEntries } from "./list-entries";

type ListProps = ToolRenderProps<z.infer<typeof DirectoryList.schema>>;
type Entry = z.infer<typeof DirectoryList.schema>["entries"][number];

function ListHeader({ target, invocation, result }: ListProps) {
  const i18n = useI18n();
  const path = inputText(target, "path");
  return <ToolHeader label={i18n.formatMessage(filesystemMessages.toolDirectoryList)}
    subject={useToolResourceSubject(invocation.resource)}
    summary={path && path !== "." && <span className="font-mono" title={path}>{path}</span>}
    meta={result?.data && i18n.formatMessage(filesystemMessages.toolEntryCount, { count: result.data.entries.length, truncated: result.data.truncated })} />;
}

const entryIcons = { directory: Folder, file: File, other: FileQuestion } as const;
const rowClass = "h-6 w-full min-w-0 justify-start gap-1.5 px-1 font-mono text-xs font-normal";

/** Files open in the listing resource's own file surface; directories and special entries are labels only. */
function EntryRow({ entry, path, resource }: { entry: Entry; path: string; resource: ListProps["invocation"]["resource"] }) {
  const object = useRendererObject();
  const navigation = useRendererResourceNavigation();
  const Icon = entryIcons[entry.type];
  const content = <>
    <Icon className={cn("size-3.5 shrink-0", entry.type === "directory" ? "text-primary-text" : "text-muted-foreground")} />
    <span className={cn("min-w-0 truncate", entry.name.startsWith(".") && "text-muted-foreground")}>{entry.name}</span>
  </>;
  if (entry.type !== "file" || !resource) return <span className={cn(rowClass, "inline-flex items-center")} title={path}>{content}</span>;
  return <Button variant="ghost" size="xs" className={rowClass} title={path}
    onClick={event => void navigation.open({ sessionId: object.ref.sessionId, id: resource.id }, path, { origin: event.currentTarget })}>
    {content}
  </Button>;
}

function ListBody({ result, invocation }: ListProps) {
  return result?.data ? <DirectoryListing data={result.data} resource={invocation.resource} /> : null;
}

/** Shared one-level listing; only a resource-backed listing provides file navigation. */
export function DirectoryListing({ data, resource }: { data: z.infer<typeof DirectoryList.schema>; resource?: ListProps["invocation"]["resource"] }) {
  const i18n = useI18n();
  const [expanded, setExpanded] = useRendererViewState("asterism.builtin/list-all", false);
  if (!data.entries.length) return <p className="type-caption">{i18n.formatMessage(filesystemMessages.toolDirectoryEmpty)}</p>;
  const entries = sortEntries(data.entries);
  const shown = expanded ? entries : entries.slice(0, TOOL_BODY_LINE_LIMIT);
  return <div className="flex flex-col gap-1.5">
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-x-1">
      {shown.map(entry => <li key={entry.name} className="min-w-0">
        <EntryRow entry={entry} path={resource ? entryPath(data.path, entry.name) : entry.name} resource={resource} />
      </li>)}
    </ul>
    {shown.length < entries.length && <Button variant="ghost" size="xs" className="self-start text-muted-foreground" onClick={() => setExpanded(true)}>
      {i18n.formatMessage(filesystemMessages.toolDirectoryShowMore, { count: entries.length - shown.length })}
    </Button>}
    {data.truncated && <p className="type-caption text-muted-foreground">{i18n.formatMessage(filesystemMessages.toolDirectoryTruncated)}</p>}
  </div>;
}
const listView = { headerRenderer: ListHeader, bodyRenderer: ListBody };
export const listViews = { input: { headerRenderer: ListHeader }, execution: listView, result: listView };
