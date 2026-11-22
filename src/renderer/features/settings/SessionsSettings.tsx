import { TooltipHint } from "@asterism-app/ui/tooltip-hint";
import { createContext, useContext, useState } from "react";
import { ArchiveRestore, Trash2 } from "lucide-react";
import type { AppSnapshot } from "../../../shared/contracts";
import type { SessionResult } from "../../../shared/session";
import { settingsMessages } from "../../messages/settings";
import { useI18n } from "../../shared/i18n";
import { useIsland } from "../../shared/weave/Screen";
import { IslandPanel, panelIslandWidth } from "../../shared/weave/IslandPanel";
import { Button } from "@asterism-app/ui/ui/button";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@asterism-app/ui/ui/item";
import { PanelList, PanelListState, type PanelListEntry } from "@asterism-app/ui/ui/panel-list";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@asterism-app/ui/ui/select";
import { sessionLifecycleDays, sessionLifecycleDaysSchema, type SessionLifecycle } from "../../../shared/configuration";
import { useConfigurationAction, useSettingsConfiguration } from "../configuration/state";
import { ConfigurationActionError, ReadStatus } from "../configuration/forms";
import { Section, Row } from "@asterism-app/ui/settings-layout";
import { existingFolder } from "../folders/context";

/** Application data needed for session management: the application layer owns the session catalog and rereads it after restoration. */
export interface SessionArchive {
  snapshot: AppSnapshot | null;
  restore(sessionId: string): Promise<SessionResult>;
}
export const SessionArchiveContext = createContext<SessionArchive | null>(null);
function useSessionArchive(): SessionArchive {
  const value = useContext(SessionArchiveContext);
  if (!value) throw new Error("SessionArchiveContext is unavailable.");
  return value;
}

/** Lifecycle preferences and catalog counts share general settings; the recycle bin opens in its own island. */
export function SessionsSettings() {
  const i18n = useI18n();
  const island = useIsland();
  const { snapshot } = useSessionArchive();
  const { snapshot: configuration, readError, load } = useSettingsConfiguration();
  const { run, busy, error } = useConfigurationAction("inline");
  const lifecycle = configuration?.sessionLifecycle;
  const save = (key: keyof SessionLifecycle, value: string) => {
    if (!lifecycle) return;
    const days = sessionLifecycleDaysSchema.parse(value === "never" ? null : Number(value));
    void run({ type: "sessionLifecycle.set", value: { ...lifecycle, [key]: days } });
  };
  const archived = snapshot?.archivedSessions.length ?? 0;
  return <Section title={i18n.text(settingsMessages.conversationsTitle)}>
    <ReadStatus loaded={!!configuration} error={readError} onRetry={() => void load()} />
    <ItemGroup className="surface-group">
      <Row label={i18n.text(settingsMessages.retentionDays)}>
        <LifecycleSelect value={lifecycle?.retentionDays} disabled={!lifecycle || busy}
          label={i18n.text(settingsMessages.retentionDays)} onChange={value => save("retentionDays", value)} />
      </Row>
      <ItemSeparator />
      <Row label={i18n.text(settingsMessages.sleepDays)}>
        <LifecycleSelect value={lifecycle?.sleepDays} disabled={!lifecycle || busy}
          label={i18n.text(settingsMessages.sleepDays)} onChange={value => save("sleepDays", value)} />
      </Row>
      <ItemSeparator />
      <Row label={i18n.formatMessage(settingsMessages.conversationCount, { count: snapshot?.sessions.length ?? 0 })}
        hint={i18n.formatMessage(settingsMessages.archivedCount, { count: archived })}>
        <Button size="sm" variant="outline" disabled={!snapshot} aria-pressed={island.has("recycle-bin")}
          onClick={event => void island.open({ key: "recycle-bin", label: settingsMessages.recycleBin, width: panelIslandWidth,
            origin: event.currentTarget, render: () => <RecycleBin /> })}>
          <Trash2 />{i18n.text(settingsMessages.recycleBin)}
        </Button>
      </Row>
    </ItemGroup>
    <ConfigurationActionError error={error} />
  </Section>;
}

function LifecycleSelect({ value, disabled, label, onChange }: {
  value: SessionLifecycle["sleepDays"] | undefined; disabled: boolean; label: string; onChange: (value: string) => void;
}) {
  const i18n = useI18n();
  return <Select value={value === undefined ? "" : value === null ? "never" : String(value)} disabled={disabled} onValueChange={onChange}>
    <SelectTrigger className="w-36" aria-label={label}><SelectValue /></SelectTrigger>
    <SelectContent><SelectGroup>
      {sessionLifecycleDays.map(days => <SelectItem key={days} value={String(days)}>
        {i18n.formatMessage(settingsMessages.lifecycleDays, { days })}
      </SelectItem>)}
      <SelectItem value="never">{i18n.text(settingsMessages.lifecycleNever)}</SelectItem>
    </SelectGroup></SelectContent>
  </Select>;
}

/** Recycle bin: lists archived sessions themselves and offers restoration; startup cleanup removes them after the grace period. */
function RecycleBin() {
  const i18n = useI18n();
  const { snapshot, restore } = useSessionArchive();
  const [pending, setPending] = useState<string | null>(null);
  const sessions = snapshot?.archivedSessions ?? [];
  const entries: PanelListEntry<(typeof sessions)[number]>[] = sessions.map(session => ({ kind: "item", key: session.id, item: session }));
  return <IslandPanel layout="fill" title={i18n.text(settingsMessages.recycleBin)}
    description={sessions.length ? i18n.formatMessage(settingsMessages.archivedCount, { count: sessions.length }) : undefined}>
    <PanelList entries={entries}
      state={!snapshot ? <PanelListState icon={<Spinner />} label={i18n.text(commonMessages.loading)} />
        : !sessions.length ? <PanelListState icon={<Trash2 />} label={i18n.text(settingsMessages.recycleBinEmpty)} /> : null}
      renderItem={session => {
        const folder = existingFolder(snapshot?.folders ?? [], session.folder_id);
        return <Item size="sm">
          <ItemContent className="min-w-0">
            <TooltipHint content={session.title}><ItemTitle className="block truncate">{session.title}</ItemTitle></TooltipHint>
            <ItemDescription className="truncate">{folder ? <>{folder.name}{" · "}</> : null}{i18n.formatMessage(settingsMessages.archivedAt,
              { date: i18n.formatDate(Date.parse(session.archived_at), { dateStyle: "medium", timeStyle: "short" }) })}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button size="sm" variant="ghost" disabled={pending !== null} aria-busy={pending === session.id}
              aria-label={i18n.formatMessage(settingsMessages.restoreConversationLabel, { title: session.title })}
              onClick={() => { setPending(session.id); void restore(session.id).finally(() => setPending(null)); }}>
              {pending === session.id ? <Spinner /> : <ArchiveRestore />}{i18n.text(settingsMessages.restoreConversation)}
            </Button>
          </ItemActions>
        </Item>;
      }} />
  </IslandPanel>;
}
