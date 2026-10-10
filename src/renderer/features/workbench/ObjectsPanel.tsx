import { useState } from "react";
import { Scan } from "lucide-react";
import { t } from "../../shared/i18n";
import { Button } from "../../shared/ui/button";
import { SearchInput } from "../../shared/ui/search-input";
import { IslandPanel } from "../../shared/weave/IslandPanel";
import { useWorkbench } from "./context";
import { useModuleViews } from "../../modules/views";

/** 对象只出现一次；面板负责快速识别与定位，不展开内容或关系。 */
export function ObjectsPanel() {
  const { session, ready, busy, historical, canvas } = useWorkbench();
  const registry = useModuleViews();
  const [query, setQuery] = useState("");
  const [hiddenOnly, setHiddenOnly] = useState(false);
  const hidden = new Set(session.views.filter(view => view.hidden).map(view => view.objectId));
  const search = query.trim().toLocaleLowerCase();
  const objects = session.objects.filter(object => (!hiddenOnly || hidden.has(object.id))
    && `${object.title} ${registry.resource(object.kind).label}`.toLocaleLowerCase().includes(search));
  return <IslandPanel title={t.objects} description={historical ? t.viewingHistory : undefined} compact toolbar={<>
    <SearchInput value={query} onChange={setQuery} label={t.searchObjects} />
    <div className="flex gap-1"><Button size="xs" variant={!hiddenOnly ? "secondary" : "ghost"} aria-pressed={!hiddenOnly} onClick={() => setHiddenOnly(false)}>{t.all}</Button>
      <Button size="xs" variant={hiddenOnly ? "secondary" : "ghost"} aria-pressed={hiddenOnly} onClick={() => setHiddenOnly(true)}>{t.hiddenObjects}</Button></div>
  </>}>
    {objects.map(object => { const descriptor = registry.resource(object.kind); return <Button key={object.id} variant="ghost"
      className="h-auto w-full justify-start gap-3 px-2 py-1.5 text-left" title={t.locateObject(object.title)} aria-label={t.locateObject(object.title)}
      disabled={!ready || busy} onClick={() => { void canvas.focusObjects([object.id], { select: true }); }}>
      <span className="shrink-0 text-muted-foreground" aria-hidden="true">{descriptor.icon}</span>
      <span className="min-w-0 flex-1"><span className="block truncate leading-5">{object.title}</span>
        <span className="type-caption block truncate leading-4 font-normal">{descriptor.label}{hidden.has(object.id) ? ` · ${t.cardHidden}` : ""}</span></span>
      <Scan className="size-3.5 text-muted-foreground" aria-hidden="true" />
    </Button>; })}
    {!objects.length && <p className="type-caption px-2 py-6 text-center">{session.objects.length ? t.noMatches : historical ? t.noObjectsHistorical : t.noObjects}</p>}
  </IslandPanel>;
}
