import { useCallback, useEffect, useState } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { Virtualizer } from "virtua";
import { IslandPanel, useI18n, useRendererCalls, useRendererEvents, useRendererIsland } from "@asterism/sdk/renderer";
import { Alert, AlertDescription } from "@asterism/ui/ui/alert";
import { Badge } from "@asterism/ui/ui/badge";
import { Button } from "@asterism/ui/ui/button";
import { IconButton } from "@asterism/ui/ui/icon-button";
import { ItemGroup, ItemSeparator } from "@asterism/ui/ui/item";
import { ListRow } from "@asterism/ui/ui/list-row";
import { SearchInput } from "@asterism/ui/ui/search-input";
import { Spinner } from "@asterism/ui/ui/spinner";
import { cn } from "@asterism/ui/utils";
import { skillsMessages as messages } from "../messages/skills";
import { useLifetimeSignal } from "../shared/use-lifetime";
import { ReadSkills, RefreshSkills, SkillsChanged, type SkillOverview, type SkillSourceOverview } from "./contract";

const islandKey = (source: string) => `skills:${source}`;
/** Issues under directory sources display paths relative to the package; files from plugin and built-in sources retain their original values. */
const issueFile = (source: string, file: string) =>
  file.startsWith(source) && /^[\\/]/.test(file.slice(source.length)) ? file.slice(source.length + 1) : file;
const activeCount = (group: SkillSourceOverview) => group.skills.filter(skill => !skill.overriddenBy).length;

/** Settings and source islands independently subscribe to the same catalog snapshot; SkillsChanged synchronizes refresh results to all subscribers. */
function useSkillCatalog() {
  const calls = useRendererCalls(), events = useRendererEvents();
  const [catalog, setCatalog] = useState<SkillOverview | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    const subscription = events.subscribe(SkillsChanged, { delivery: "latest", signal: controller.signal }, ({ data }) => setCatalog(data));
    void subscription.ready.then(() => calls.invoke(ReadSkills, {}, { signal: controller.signal }))
      .then(value => { if (!controller.signal.aborted) setCatalog(value); },
        () => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [calls, events, attempt]);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  return { catalog, failed, retry };
}

/** Settings show only source summaries; entries are searchable in source islands, while the model reads bodies and supporting files as needed. */
export function SkillSettings() {
  const i18n = useI18n(), calls = useRendererCalls(), island = useRendererIsland();
  const { catalog, failed, retry } = useSkillCatalog();
  const [refreshing, setRefreshing] = useState(false), [refreshFailed, setRefreshFailed] = useState(false);
  const lifetime = useLifetimeSignal();
  const refresh = async () => {
    const signal = lifetime();
    setRefreshing(true); setRefreshFailed(false);
    try { await calls.invoke(RefreshSkills, {}, { signal }); }
    catch { if (!signal.aborted) setRefreshFailed(true); }
    finally { if (!signal.aborted) setRefreshing(false); }
  };
  const open = (source: string, origin: HTMLElement) => island.open({ key: islandKey(source), label: messages.source, origin,
    render: () => <SkillSourcePanel source={source} /> });
  const total = catalog?.sources.reduce((sum, group) => sum + activeCount(group), 0) ?? 0;

  return <div className="flex flex-col gap-3">
    <div className="flex items-center justify-between gap-2">
      <p className="type-caption">{catalog ? i18n.formatMessage(messages.count, { count: total })
        : !failed && <span className="flex items-center gap-2"><Spinner />{i18n.text(messages.loading)}</span>}</p>
      <IconButton label={i18n.text(messages.refresh)} disabled={!catalog || refreshing} aria-busy={refreshing}
        onClick={() => { void refresh(); }}>{refreshing ? <Spinner /> : <RefreshCw />}</IconButton>
    </div>
    {(failed || refreshFailed) && <Alert variant="destructive"><AlertDescription>
      {i18n.text(messages.failed)}
      {failed && <Button variant="outline" size="sm" onClick={retry}>{i18n.text(messages.retry)}</Button>}
    </AlertDescription></Alert>}
    {catalog && <>
      <ItemGroup className="surface">{catalog.sources.flatMap((group, index) => {
        const overridden = group.skills.length - activeCount(group);
        const row = <div key={group.source} role="listitem">
          <ListRow selected={island.child === islandKey(group.source)} onOpen={origin => { void open(group.source, origin); }}
            title={<span className="block truncate font-mono text-xs" title={group.source} translate="no">{group.source}</span>}
            description={group.skills.length
              ? i18n.formatMessage(messages.sourceSummary, { count: group.skills.length, overridden })
              : `${i18n.text(messages.empty)} ${i18n.text(messages.emptyHint)}`}
            actions={group.issues.length > 0 && <Badge variant="warning"><TriangleAlert />
              {i18n.formatMessage(messages.issueCount, { count: group.issues.length })}</Badge>} />
        </div>;
        return index ? [<ItemSeparator key={`${group.source}-separator`} />, row] : [row];
      })}</ItemGroup>
      {catalog.sources.length > 1 && <p className="type-caption">{i18n.text(messages.overrideOrder)}</p>}
    </>}
  </div>;
}

/**
 * Source island: discovery issues appear first, skills can be filtered by name and description, and the list is virtualized to accommodate thousands of entries.
 * The virtual list sits directly in the island content area, using that area as its scroll container; status and issues scroll together as the first list item.
 */
function SkillSourcePanel({ source }: { source: string }) {
  const i18n = useI18n();
  const { catalog, failed, retry } = useSkillCatalog();
  const [query, setQuery] = useState("");
  const group = catalog?.sources.find(item => item.source === source);
  const q = query.trim().toLowerCase();
  const skills = group?.skills.filter(skill => !q || skill.name.toLowerCase().includes(q) || skill.description.toLowerCase().includes(q)) ?? [];
  const status = failed ? <Alert variant="destructive"><AlertDescription>{i18n.text(messages.failed)}
      <Button variant="outline" size="sm" onClick={retry}>{i18n.text(messages.retry)}</Button></AlertDescription></Alert>
    : !catalog ? <p className="type-caption flex items-center gap-2"><Spinner />{i18n.text(messages.loading)}</p>
    : !group ? <p className="type-caption">{i18n.text(messages.sourceRemoved)}</p>
    : !group.skills.length ? <p className="type-caption">{i18n.text(messages.empty)} {i18n.text(messages.emptyHint)}</p>
    : !skills.length ? <p className="type-caption">{i18n.text(messages.noMatch)}</p> : null;
  const issues = !!group?.issues.length && <Alert><TriangleAlert className="text-warning" />
    <AlertDescription>
      <p className="text-foreground">{i18n.text(messages.issues)}</p>
      {group.issues.map((issue, index) => <p key={`${issue.file}:${index}`} className="break-all select-text">
        <span className="font-mono text-xs" translate="no">{issueFile(source, issue.file)}</span>: {issue.message}</p>)}
    </AlertDescription></Alert>;
  const rows = [
    ...(issues ? [{ key: "issues", node: <div className="pb-3">{issues}</div> }] : []),
    ...(status ? [{ key: "status", node: <div className="pb-3">{status}</div> }] : []),
    ...skills.map(skill => ({ key: `skill:${skill.name}`, node: <div className={cn("flex flex-col gap-0.5 py-2", skill.overriddenBy && "opacity-60")}>
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-medium text-foreground select-text" translate="no">{skill.name}</span>
        {skill.overriddenBy && <Badge variant="secondary" className="max-w-1/2 min-w-0" title={skill.overriddenBy}>
          <span className="truncate">{i18n.formatMessage(messages.overriddenBy, { source: skill.overriddenBy })}</span></Badge>}
      </div>
      <p className="type-caption line-clamp-2 select-text" title={skill.description}>{skill.description}</p>
    </div> })),
  ];
  return <IslandPanel title={source} description={group ? i18n.formatMessage(messages.count, { count: group.skills.length }) : undefined}
    toolbar={!!group?.skills.length && <SearchInput value={query} onChange={setQuery} label={i18n.text(messages.search)} />}>
    <Virtualizer data={rows}>{row => <div key={row.key}>{row.node}</div>}</Virtualizer>
  </IslandPanel>;
}
