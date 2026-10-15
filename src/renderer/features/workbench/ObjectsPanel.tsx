import { IslandPanel } from "../../shared/weave/IslandPanel";
import { SearchInput } from "../../shared/ui/search-input";
import { ToggleGroup, ToggleGroupItem } from "../../shared/ui/toggle-group";
import { Button } from "../../shared/ui/button";
import { Scan } from "lucide-react";
import { commonMessages } from "../../messages/common";
import { objectsMessages } from "../../messages/objects";
import { useI18n } from "../../shared/i18n";
import { useState } from "react";

import { useWorkbench } from "./context";
import { useModuleViews } from "../../modules/views";

/** 对象只出现一次；面板负责快速识别与定位，不展开内容或关系。 */
export function ObjectsPanel() {
  const i18n = useI18n();
  const { session, ready, busy, canvas } = useWorkbench();
  const registry = useModuleViews();
  const [query, setQuery] = useState("");
  const [hiddenOnly, setHiddenOnly] = useState(false);
  const hidden = new Set(session.views.filter(view => view.hidden).map(view => view.objectId));
  const search = query.trim().toLocaleLowerCase(i18n.locale);
  const objects = session.objects.filter(object => (!hiddenOnly || hidden.has(object.id))
    && `${object.title} ${i18n.text(registry.resource(object.kind).label)}`.toLocaleLowerCase(i18n.locale).includes(search));
  return <IslandPanel title={i18n.formatMessage(objectsMessages.objects)} compact toolbar={<>
    <SearchInput value={query} onChange={setQuery} label={i18n.formatMessage(objectsMessages.searchObjects)} />
    <ToggleGroup type="single" size="sm" aria-label={i18n.formatMessage(objectsMessages.objects)} value={hiddenOnly ? "hidden" : "all"} onValueChange={next => { if (next) setHiddenOnly(next === "hidden"); }}>
      <ToggleGroupItem value="all">{i18n.formatMessage(commonMessages.all)}</ToggleGroupItem>
      <ToggleGroupItem value="hidden">{i18n.formatMessage(objectsMessages.hiddenObjects)}</ToggleGroupItem>
    </ToggleGroup>
  </>}>
    {objects.map(object => { const descriptor = registry.resource(object.kind); return <Button key={object.id} variant="ghost"
      className="h-auto w-full justify-start gap-3 px-2 py-1.5 text-left" title={i18n.formatMessage(objectsMessages.locateObject, { title: object.title })} aria-label={i18n.formatMessage(objectsMessages.locateObject, { title: object.title })}
      disabled={!ready || busy} onClick={() => { void canvas.focusObjects([object.id], { select: true }); }}>
      <span className="shrink-0 text-muted-foreground" aria-hidden="true">{descriptor.icon}</span>
      <span className="min-w-0 flex-1"><span className="block truncate leading-5">{object.title}</span>
        <span className="type-caption block truncate leading-4 font-normal">{i18n.text(descriptor.label)}{hidden.has(object.id) ? ` · ${i18n.formatMessage(objectsMessages.cardHidden)}` : ""}</span></span>
      <Scan className="size-3.5 text-muted-foreground" aria-hidden="true" />
    </Button>; })}
    {!objects.length && <p className="type-caption px-2 py-6 text-center">{session.objects.length ? i18n.formatMessage(commonMessages.noMatches) : i18n.formatMessage(objectsMessages.noObjects)}</p>}
  </IslandPanel>;
}
