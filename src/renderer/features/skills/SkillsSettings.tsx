import { TooltipHint } from "@asterism-app/ui/tooltip-hint";
import { useCallback, useEffect, useState } from "react";
import { BookOpen, Folder, FolderOpen, Puzzle, RefreshCw, Search, TriangleAlert } from "lucide-react";
import { IslandPanel, useI18n, useRendererApplication, useRendererCalls, useRendererEvents, useRendererIsland } from "@asterism-app/sdk/renderer";
import type { UiText } from "@asterism-app/sdk/contracts";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { Badge } from "@asterism-app/ui/ui/badge";
import { Button } from "@asterism-app/ui/ui/button";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from "@asterism-app/ui/ui/item";
import { ListRow } from "@asterism-app/ui/ui/list-row";
import { PanelList, PanelListState, type PanelListEntry } from "@asterism-app/ui/ui/panel-list";
import { SearchInput } from "@asterism-app/ui/ui/search-input";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { Markdown } from "@asterism-app/ui/markdown";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { failureDisplay } from "@asterism-app/ui/error-display";
import { useLifetimeSignal } from "@asterism-app/ui/use-lifetime";
import { PluginCallScope, PluginIslandProvider } from "../plugins/scope";
import { Section } from "@asterism-app/ui/settings-layout";
import { toast } from "../../shared/toast";
import { skillsMessages as messages } from "../../messages/skills";
import { pluginName } from "../../../shared/plugin-name";
import type { AppSnapshot } from "../../../shared/contracts";
import { ReadSkillDocument, ReadSkills, RefreshSkills, SkillsChanged, type SkillSource } from "../../../shared/skills";

type Skill = SkillSource["skills"][number];
/** Display names of loaded plugins by ID; sources of unknown plugins fall back to the plugin ID. */
type PluginNames = ReadonlyMap<string, UiText>;

const catalogKey = "skills:catalog";
const skillKey = (source: string, name: string) => `skills:skill:${source}\u0000${name}`;
/** Issues under directory sources display paths relative to the package; files from plugin and built-in sources retain their original values. */
const issueFile = (source: string, file: string) =>
  file.startsWith(source) && /^[\\/]/.test(file.slice(source.length)) ? file.slice(source.length + 1) : file;

function sourceTitle(source: Pick<SkillSource, "plugin">, names: PluginNames): UiText {
  return source.plugin === null ? messages.userDirectory : names.get(source.plugin) ?? source.plugin;
}

/** Settings and catalog islands independently subscribe to the same catalog snapshot; SkillsChanged synchronizes refresh results to all subscribers. */
function useSkillCatalog() {
  const calls = useRendererCalls(), events = useRendererEvents();
  const [catalog, setCatalog] = useState<SkillSource[] | null>(null);
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

/**
 * Settings show the catalog entry and a source summary. Skills are browsed in one catalog island grouped by source,
 * and each skill opens a detail island owned by it; the model reads bodies and supporting files as needed.
 */
export function SkillSettings({ plugins }: { plugins: AppSnapshot["plugins"] }) {
  const names: PluginNames = new Map(plugins.flatMap(plugin => plugin.id ? [[plugin.id, pluginName(plugin)] as const] : []));
  return <PluginCallScope><PluginIslandProvider pluginId="asterism.host" page><SkillSettingsBody names={names} /></PluginIslandProvider></PluginCallScope>;
}
function SkillSettingsBody({ names }: { names: PluginNames }) {
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
  const open = (origin: HTMLElement) => island.open({ key: catalogKey, label: messages.title, origin,
    render: () => <SkillCatalogPanel names={names} /> });
  const total = catalog?.reduce((sum, group) => sum + group.skills.length, 0) ?? 0;
  const issues = catalog?.reduce((sum, group) => sum + group.issues.length, 0) ?? 0;

  return <div className="flex flex-col gap-3">
    {(failed || refreshFailed) && <Alert variant="destructive"><AlertDescription>
      {i18n.text(messages.failed)}
      {failed && <Button variant="outline" size="sm" onClick={retry}>{i18n.text(messages.retry)}</Button>}
    </AlertDescription></Alert>}
    <ItemGroup className="surface">
      <div role="listitem">
        <ListRow opens disabled={!catalog} selected={island.has(catalogKey)} onOpen={origin => { void open(origin); }}
          media={<BookOpen className="size-4 text-folder-violet" />} title={i18n.text(messages.allSkills)}
          description={catalog ? i18n.formatMessage(messages.count, { count: total })
            : !failed && <span className="inline-flex items-center gap-2"><Spinner />{i18n.text(messages.loading)}</span>}
          trailing={issues > 0 && <Badge variant="warning"><TriangleAlert />{i18n.formatMessage(messages.issueCount, { count: issues })}</Badge>}
          actions={<IconButton label={i18n.text(messages.refresh)} disabled={!catalog || refreshing} aria-busy={refreshing}
            onClick={() => { void refresh(); }}>{refreshing ? <Spinner /> : <RefreshCw />}</IconButton>} />
      </div>
    </ItemGroup>
    {catalog && catalog.length > 0 && <Section title={i18n.text(messages.sources)} hint={i18n.text(messages.composition)}>
      <ItemGroup className="surface">{catalog.flatMap((group, index) => {
        const row = <SourceRow key={group.id} group={group} names={names} />;
        return index ? [<ItemSeparator key={`${group.id}-separator`} />, row] : [row];
      })}</ItemGroup>
    </Section>}
  </div>;
}

/** Source summary: readable owner, original identity, skill count, and issues; user directories can be shown in the file manager. */
function SourceRow({ group, names }: { group: SkillSource; names: PluginNames }) {
  const i18n = useI18n(), application = useRendererApplication();
  const user = group.plugin === null;
  const Icon = user ? Folder : Puzzle;
  const reveal = () => application.showLocalFile(group.directory, true)
    .catch(() => { toast.error(i18n.text(commonMessages.locationActionFailed)); });
  return <Item role="listitem" size="sm">
    <ItemMedia><Icon className="size-4 text-muted-foreground" /></ItemMedia>
    <ItemContent className="min-w-0">
      <ItemTitle className="block truncate">{i18n.text(sourceTitle(group, names))}</ItemTitle>
      <TooltipHint content={group.id}><ItemDescription className="truncate font-mono text-xs select-text" translate="no">{group.id}</ItemDescription></TooltipHint>
    </ItemContent>
    <ItemActions>
      {group.issues.length > 0 && <Badge variant="warning"><TriangleAlert />{i18n.formatMessage(messages.issueCount, { count: group.issues.length })}</Badge>}
      <span className="type-caption tabular-nums">{i18n.formatMessage(messages.count, { count: group.skills.length })}</span>
      {user && <IconButton label={i18n.text(commonMessages.showInFileManager)} onClick={() => { void reveal(); }}><FolderOpen /></IconButton>}
    </ItemActions>
  </Item>;
}

/**
 * Catalog island: every source's skills grouped under source headings, filtered by name and description,
 * virtualized to accommodate thousands of entries. Discovery issues scroll with the list as its first row.
 */
function SkillCatalogPanel({ names }: { names: PluginNames }) {
  const i18n = useI18n(), island = useRendererIsland();
  const { catalog, failed, retry } = useSkillCatalog();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const total = catalog?.reduce((sum, group) => sum + group.skills.length, 0) ?? 0;
  const entries: PanelListEntry<Skill>[] = (catalog ?? []).flatMap(group => {
    const skills = group.skills.filter(skill => !q || skill.name.toLowerCase().includes(q) || skill.description.toLowerCase().includes(q));
    return skills.length ? [
      { kind: "heading" as const, key: `source:${group.id}`, title: i18n.text(sourceTitle(group, names)), meta: skills.length },
      ...skills.map(skill => ({ kind: "item" as const, key: skillKey(group.id, skill.name), item: skill })),
    ] : [];
  });
  const open = (skill: Skill, origin: HTMLElement) => island.open({ key: skillKey(skill.source.id, skill.name), label: messages.skill, size: "content", origin,
    render: () => <SkillDetailPanel source={skill.source.id} name={skill.name} names={names} /> });
  const issues = catalog?.filter(group => group.issues.length) ?? [];
  const notice = issues.length > 0 && <Alert><TriangleAlert className="text-warning" />
    <AlertDescription>
      <p className="text-foreground">{i18n.text(messages.issues)}</p>
      {issues.flatMap(group => group.issues.map((issue, index) => <p key={`${group.id}:${issue.file}:${index}`} className="break-all select-text">
        <span className="font-mono text-xs" translate="no">{issueFile(group.id, issue.file)}</span>: {issue.message}</p>))}
    </AlertDescription></Alert>;
  const state = failed ? <PanelListState icon={<TriangleAlert />} label={i18n.text(messages.failed)}
      action={<Button variant="outline" size="sm" onClick={retry}>{i18n.text(messages.retry)}</Button>} />
    : !catalog ? <PanelListState icon={<Spinner />} label={i18n.text(messages.loading)} />
    : !total ? <PanelListState icon={<BookOpen />} label={`${i18n.text(messages.empty)} ${i18n.text(messages.emptyHint)}`} />
    : !entries.length ? <PanelListState icon={<Search />} label={i18n.text(messages.noMatch)} /> : null;
  return <IslandPanel layout="fill" title={i18n.text(messages.title)} description={catalog ? i18n.formatMessage(messages.count, { count: total }) : undefined}
    toolbar={total > 0 && <SearchInput value={query} onChange={setQuery} label={i18n.text(messages.search)} />}>
    <PanelList entries={entries} notice={notice || undefined} state={state}
      renderItem={skill => <ListRow opens descriptionLines={2} selected={island.has(skillKey(skill.source.id, skill.name))}
        onOpen={origin => { void open(skill, origin); }}
        title={<span className="block truncate" translate="no">{skill.name}</span>}
        description={skill.description} />} />
  </IslandPanel>;
}

/**
 * Detail island for one source's copy of a skill: catalog metadata followed by the current SKILL.md instructions.
 * Which copy is effective for a given Agent paradigm is resolved by that paradigm, not shown here.
 */
function SkillDetailPanel({ source, name, names }: { source: string; name: string; names: PluginNames }) {
  const i18n = useI18n(), calls = useRendererCalls(), application = useRendererApplication();
  const { catalog, failed, retry } = useSkillCatalog();
  const group = catalog?.find(item => item.id === source);
  const skill = group?.skills.find(item => item.name === name);
  const [instructions, setInstructions] = useState<{ text: string } | { error: UiText } | null>(null);
  const directory = skill?.directory;
  useEffect(() => {
    if (!directory) return;
    const controller = new AbortController();
    setInstructions(null);
    calls.invoke(ReadSkillDocument, { source, name }, { signal: controller.signal }).then(
      value => { if (!controller.signal.aborted) setInstructions(value); },
      error => { if (!controller.signal.aborted) setInstructions({ error: failureDisplay(error, messages.documentFailed) }); });
    return () => controller.abort();
  }, [calls, source, name, directory]);
  const reveal = (path: string) => application.showLocalFile(path, true)
    .catch(() => { toast.error(i18n.text(commonMessages.locationActionFailed)); });
  const owner = group ? i18n.text(sourceTitle(group, names)) : undefined;
  const status = failed ? <Alert variant="destructive"><AlertDescription>{i18n.text(messages.failed)}
      <Button variant="outline" size="sm" onClick={retry}>{i18n.text(messages.retry)}</Button></AlertDescription></Alert>
    : !catalog ? <p className="type-caption flex items-center gap-2" role="status"><Spinner />{i18n.text(messages.loading)}</p>
    : !skill ? <p className="type-caption" role="status">{i18n.text(messages.skillRemoved)}</p> : null;
  return <IslandPanel title={name} description={owner}
    action={skill && <IconButton label={i18n.text(commonMessages.showInFileManager)} onClick={() => { void reveal(skill.directory); }}><FolderOpen /></IconButton>}>
    {status ?? (skill && <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <p className="type-body text-pretty select-text">{skill.description}</p>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
          <dt className="type-label">{i18n.text(messages.source)}</dt>
          <TooltipHint content={source}><dd className="type-caption truncate font-mono select-text" translate="no">{source}</dd></TooltipHint>
          <dt className="type-label">{i18n.text(messages.directory)}</dt>
          <dd className="type-caption break-all font-mono select-text" translate="no">{skill.directory}</dd>
        </dl>
      </div>
      <div className="border-t pt-5">
        {!instructions ? <p className="type-caption flex items-center gap-2" role="status"><Spinner />{i18n.text(commonMessages.loading)}</p>
          : "error" in instructions ? <Alert variant="destructive"><AlertDescription>{i18n.text(instructions.error)}</AlertDescription></Alert>
          : <div className="select-text"><Markdown>{instructions.text}</Markdown></div>}
      </div>
    </div>)}
  </IslandPanel>;
}
