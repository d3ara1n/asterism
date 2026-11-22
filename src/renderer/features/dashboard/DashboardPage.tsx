import { useCallback, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { UiMessage } from "@asterism-app/sdk/contracts";
import { Button } from "@asterism-app/ui/ui/button";
import { PageState } from "@asterism-app/ui/ui/page-state";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { commonMessages } from "@asterism-app/ui/messages/common";
import type { TelemetryGroup } from "../../../shared/telemetry";
import { runtime } from "../../runtime";
import { useI18n } from "../../shared/i18n";
import { exitTransition, fadeTransition } from "../../shared/weave/motion";
import { useIsland, useIslandStrip } from "../../shared/weave/Screen";
import { dashboardMessages as msg } from "../../messages/dashboard";
import { DetailIsland, detailKey, detailPrefix, detailWidth, type DetailSubject } from "./DetailIsland";
import { FilterChips } from "./Filters";
import { groupLabel } from "./format";
import { useDashboard, usePageFilter, type DashboardModel, type DashboardView } from "./model";
import { useTelemetry } from "./use-telemetry";
import { ActivityView } from "./views/ActivityView";
import { AttributionView } from "./views/AttributionView";
import { ModelsView } from "./views/ModelsView";
import { OverviewView } from "./views/OverviewView";
import { ToolsView } from "./views/ToolsView";
import type { ViewProps } from "./views/context";

const views: Record<DashboardView, (props: ViewProps) => ReactNode> = {
  overview: OverviewView, attribution: AttributionView, models: ModelsView, activity: ActivityView, tools: ToolsView,
};

/**
 * Usage statistics as the root island of the main screen. Panel cards sit directly on the window material, like Home;
 * the view switch, range, and filters live in the window titlebar. Details open as ordinary islands to the right, owned by this root.
 */
export function DashboardPage({ model, active, onOpenSession }: { model: DashboardModel; active: boolean; onOpenSession: (sessionId: string) => void }) {
  const i18n = useI18n();
  const island = useIsland();
  const strip = useIslandStrip();
  const state = useDashboard(model);
  const page = usePageFilter(state);
  const facets = useTelemetry(page.filter, { kind: "facets" }, state.revision, active);
  const openKey = useSyncExternalStore(strip.subscribe, () => {
    const snapshot = strip.getSnapshot();
    const focused = snapshot.islands.find(item => item.id === snapshot.focus) ?? snapshot.islands.findLast(item => item.key.startsWith(detailPrefix));
    return focused?.key.startsWith(detailPrefix) ? focused.key.slice(detailPrefix.length) : null;
  });

  useEffect(() => { if (facets.data) model.setFacets(facets.data); }, [facets.data, model]);
  useEffect(() => { model.setPending(facets.pending && facets.data !== null); }, [facets.pending, facets.data, model]);
  useEffect(() => active ? runtime.telemetry.onChanged(() => model.refresh()) : undefined, [active, model]);
  // Re-anchor relative ranges when returning to the page after time has passed.
  useEffect(() => { if (active) model.refresh(); }, [active, model]);

  const openSubject = useCallback((subject: DetailSubject, label: string, origin?: HTMLElement) => {
    const spec = { key: detailKey(subject), label, width: detailWidth, origin,
      render: () => <DetailIsland model={model} subject={subject} onOpenSession={onOpenSession} /> };
    // An open subject is located in place; another subject replaces the current details rather than stacking beside them.
    if (island.has(spec.key)) void island.open(spec);
    else void island.closeOwned({ force: true }).then(() => island.open(spec));
  }, [island, model, onOpenSession]);
  const openGroup = useCallback((group: TelemetryGroup, origin: HTMLElement) => openSubject({ kind: "group", group }, groupLabel(i18n, group), origin), [openSubject, i18n]);
  const openDay = useCallback((start: number) => openSubject({ kind: "day", start }, i18n.formatDate(start, { dateStyle: "medium" })), [openSubject, i18n]);

  const empty = facets.data !== null && facets.data.firstEventAt === null;
  const View = views[state.view];
  const status = (kind: "error" | "empty", title: UiMessage, body?: UiMessage, action?: ReactNode) =>
    <PageState kind={kind} title={i18n.text(title)} body={body && i18n.text(body)} action={action} className="min-h-80" />;
  return <div className="dashboard-page">
    <div className="flex w-full flex-col gap-3">
      {Object.keys(state.filters).length > 0 && <FilterChips model={model} facets={state.facets} filters={state.filters} labels={state.labels} />}
      {facets.error && !facets.data ? status("error", msg.loadFailed, undefined,
        <Button variant="outline" size="sm" onClick={() => model.refresh()}>{i18n.text(commonMessages.retry)}</Button>)
        : !facets.data ? <div className="flex min-h-80 items-center justify-center"><Spinner /></div>
        : empty ? status("empty", msg.emptyTitle, msg.emptyBody)
        : <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={state.view} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6, transition: exitTransition }} transition={fadeTransition}>
            <View model={model} state={state} page={page} openGroup={openGroup} openDay={openDay} openKey={openKey} />
          </motion.div>
        </AnimatePresence>}
      {state.facets?.firstEventAt != null && <p className="type-caption text-center">
        {i18n.formatMessage(msg.recordingSince, { date: i18n.formatDate(state.facets.firstEventAt, { dateStyle: "medium" }) })}</p>}
    </div>
  </div>;
}
