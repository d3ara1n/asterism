import { IslandPanel } from "../../shared/weave/IslandPanel";
import { SearchInput } from "@asterism/ui/ui/search-input";
import { ToggleGroup, ToggleGroupItem } from "@asterism/ui/ui/toggle-group";
import { IconButton } from "@asterism/ui/ui/icon-button";
import { ListRow } from "@asterism/ui/ui/list-row";
import { Eye, EyeClosed } from "lucide-react";
import { commonMessages } from "@asterism/ui/messages/common";
import { objectsMessages } from "../../messages/objects";
import { useI18n } from "../../shared/i18n";
import { useState } from "react";

import { useWorkbench } from "./context";
import { useModuleViews } from "../../modules/views";

/** 对象只出现一次；整行定位，行内操作管理卡片可见性。 */
export function ObjectsPanel() {
  const i18n = useI18n();
  const { session, ready, canvas, run } = useWorkbench();
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
    {objects.map(object => {
      const descriptor = registry.resource(object.kind);
      const isHidden = hidden.has(object.id);
      return <ListRow key={object.id} variant="navigation" className="h-auto px-2 py-1.5"
        title={<>
          <span className="block truncate leading-5">{object.title}</span>
          <span className="type-caption block truncate leading-4 font-normal">{i18n.text(descriptor.label)}{isHidden ? ` · ${i18n.formatMessage(objectsMessages.cardHidden)}` : ""}</span>
        </>}
        media={<span className="text-muted-foreground" aria-hidden="true">{descriptor.icon}</span>}
        buttonProps={{ "aria-label": i18n.formatMessage(objectsMessages.locateObject, { title: object.title }) }}
        disabled={!ready} onOpen={() => { void canvas.locateObjects([object.id], { select: true }); }}
        actions={<IconButton size="icon-xs" disabled={!ready}
          label={i18n.formatMessage(isHidden ? objectsMessages.showCard : objectsMessages.hideCard, { title: object.title })}
          onClick={() => { void run({ type: "view.set", sessionId: session.id, objectId: object.id, hidden: !isHidden }); }}>
          {isHidden ? <EyeClosed /> : <Eye />}
        </IconButton>} />;
    })}
    {!objects.length && <p className="type-caption px-2 py-6 text-center">{session.objects.length ? i18n.formatMessage(commonMessages.noMatches) : i18n.formatMessage(objectsMessages.noObjects)}</p>}
  </IslandPanel>;
}
