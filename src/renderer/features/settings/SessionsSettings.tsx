import { createContext, useContext, useState } from "react";
import { ArchiveRestore, Trash2 } from "lucide-react";
import type { AppSnapshot } from "../../../shared/contracts";
import type { SessionResult } from "../../../shared/session";
import { settingsMessages } from "../../messages/settings";
import { useI18n } from "../../shared/i18n";
import { useIsland } from "../../shared/weave/Screen";
import { IslandPanel, panelIslandWidth } from "../../shared/weave/IslandPanel";
import { Button } from "@asterism/ui/ui/button";
import { Spinner } from "@asterism/ui/ui/spinner";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@asterism/ui/ui/item";
import { Section, Row } from "./layout";

/** 会话管理所需的应用数据：会话目录由应用层持有，恢复后由应用层重读。 */
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

/** 通用设置中的会话管理版面：只展示计数，回收站作为更深浮岛打开，不单独成为设置分类。 */
export function SessionsSettings() {
  const i18n = useI18n();
  const island = useIsland();
  const { snapshot } = useSessionArchive();
  const archived = snapshot?.archivedSessions.length ?? 0;
  return <Section title={i18n.text(settingsMessages.conversationsTitle)}>
    <ItemGroup className="surface">
      <Row label={i18n.formatMessage(settingsMessages.conversationCount, { count: snapshot?.sessions.length ?? 0 })}
        hint={i18n.formatMessage(settingsMessages.archivedCount, { count: archived })}>
        <Button size="sm" variant="outline" disabled={!snapshot} aria-pressed={island.child === "recycle-bin"}
          onClick={event => void island.open({ id: "recycle-bin", label: settingsMessages.recycleBin, width: panelIslandWidth,
            origin: event.currentTarget, render: () => <RecycleBin /> })}>
          <Trash2 />{i18n.text(settingsMessages.recycleBin)}
        </Button>
      </Row>
    </ItemGroup>
  </Section>;
}

/** 回收站：列出归档会话本身并提供恢复；清除由启动清理在冷静期后进行。 */
function RecycleBin() {
  const i18n = useI18n();
  const { snapshot, restore } = useSessionArchive();
  const [pending, setPending] = useState<string | null>(null);
  const sessions = snapshot?.archivedSessions ?? [];
  return <IslandPanel title={i18n.text(settingsMessages.recycleBin)} description={i18n.text(settingsMessages.recycleBinHint)}>
    {sessions.length === 0 ? <p className="type-caption px-1 py-3">{i18n.text(settingsMessages.recycleBinEmpty)}</p>
      : <ItemGroup className="surface">{sessions.map((session, index) => <div key={session.id}>{index > 0 && <ItemSeparator />}
        <Item size="sm">
          <ItemContent className="min-w-0">
            <ItemTitle className="block truncate" title={session.title}>{session.title}</ItemTitle>
            <ItemDescription>{i18n.formatMessage(settingsMessages.archivedAt,
              { date: i18n.formatDate(Date.parse(session.archived_at), { dateStyle: "medium", timeStyle: "short" }) })}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button size="sm" variant="ghost" disabled={pending !== null} aria-busy={pending === session.id}
              aria-label={i18n.formatMessage(settingsMessages.restoreConversationLabel, { title: session.title })}
              onClick={() => { setPending(session.id); void restore(session.id).finally(() => setPending(null)); }}>
              {pending === session.id ? <Spinner /> : <ArchiveRestore />}{i18n.text(settingsMessages.restoreConversation)}
            </Button>
          </ItemActions>
        </Item></div>)}</ItemGroup>}
  </IslandPanel>;
}
