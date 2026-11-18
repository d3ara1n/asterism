import { motion, useIsPresent, useReducedMotion } from "motion/react";
import { commandMotionStyle, commandResizeTransition, commandSurfaceMotion, useCommandContentHeight } from "@asterism-app/ui/command-motion";
import { useCommandPageMotion } from "@asterism-app/ui/command-page";
import { TooltipHint } from "@asterism-app/ui/tooltip-hint";
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import type { VirtualizerHandle } from "virtua";
import { VirtualList } from "@asterism-app/ui/ui/virtual-list";
import { BookOpen, ChevronLeft, ChevronRight, Link2, Shapes } from "lucide-react";
import { useI18n, useRendererCalls, useRendererObject, useRendererResources, useSessionRead, type RendererSessionSnapshot } from "@asterism-app/sdk/renderer";
import { resourceUrl, skillUrl, type ResourceSnapshot } from "@asterism-app/sdk/contracts";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { cn } from "@asterism-app/ui/utils";
import { SkillList } from "../../skills/contract";
import { skillsMessages } from "../../messages/skills";
import { conversationMessages as messages } from "../../messages/conversation";
import { menuRows, type MenuCategory, type MenuRow, type MenuSkill, type MenuView } from "./reference-menu-model";
import { useReferenceTargets } from "./reference-targets";

/** Keyboard input forwarded from the editor while the menu is open; focus stays in the editor. */
export interface ReferenceMenuHandle {
  keyDown(event: KeyboardEvent): boolean;
}

const rowHeight = 40;
const maxListHeight = 7 * rowHeight;

export function ReferenceMenu({ ref, listId, query, composing, onNavigate, onSelect, onActiveChange }: {
  ref: Ref<ReferenceMenuHandle>; listId: string; query: string; composing: boolean;
  onNavigate(scope: boolean): void;
  onSelect(label: string, href: string): void;
  onActiveChange(id: string | null): void;
}) {
  const i18n = useI18n(), calls = useRendererCalls(), descriptions = useRendererResources(), object = useRendererObject();
  const present = useIsPresent();
  const reducedMotion = useReducedMotion();
  const [skills, setSkills] = useState<{ items: readonly MenuSkill[]; failed: boolean }>();
  const [view, setView] = useState<MenuView>({ level: "root" });
  const list = useRef<VirtualizerHandle>(null);
  const receiver = object.ref;
  const readLinks = useCallback((snapshot: RendererSessionSnapshot, signal: AbortSignal) =>
    snapshot.resources.linkedTo(receiver, { signal }), [receiver]);
  const links = useSessionRead(present ? object.session.snapshot() : null, readLinks);

  // Presence can reverse an exit before unmounting; each opening starts at the root with fresh catalogs.
  useEffect(() => {
    if (!present) return;
    setSkills(undefined);
    setView({ level: "root" });
    setActiveState({ key: "", index: 0 });
    const controller = new AbortController();
    const { signal } = controller;
    void calls.invoke(SkillList, {}, { signal }).then(items => {
      if (!signal.aborted) setSkills({ items, failed: false });
    }, () => { if (!signal.aborted) setSkills({ items: [], failed: true }); });
    return () => controller.abort();
  }, [calls, present]);

  const selected = view.level === "resource" ? links.data?.find(resource => resource.ref.id === view.id) : undefined;
  const provider = selected ? descriptions.get(selected.ref.kind).referenceTargets : undefined;
  const targets = useReferenceTargets(present ? provider : undefined, selected?.ref, query, composing, calls);
  const rows: MenuRow[] = view.level === "resource"
    ? targets.status === "ready" ? targets.items.map(target => ({ kind: "target", target })) : []
    : menuRows(view, query, skills?.items ?? [], links.data ?? []);
  const page = view.level === "resource" ? `resource:${view.id}` : view.level === "category" ? view.category : "root";
  const rowsKey = `${page}\u0000${query}`;
  const [activeState, setActiveState] = useState({ key: rowsKey, index: 0 });
  const body = useCommandPageMotion<HTMLDivElement>(page, view.level === "resource" ? 2 : view.level === "category" ? 1 : 0);
  const { ref: contentRef, height } = useCommandContentHeight(rowsKey);
  const active = rows.length ? Math.min(activeState.key === rowsKey ? activeState.index : 0, rows.length - 1) : -1;
  const activeRow = active >= 0 ? rows[active] : undefined;
  const optionId = (index: number) => `${listId}-${index}`;
  const setActive = (index: number) => setActiveState({ key: rowsKey, index });
  const activeId = active >= 0 ? optionId(active) : null;
  useEffect(() => {
    if (active >= 0) list.current?.scrollToIndex(active, { align: "nearest" });
    onActiveChange(present ? activeId : null);
  }, [active, activeId, onActiveChange, present, rowsKey]);
  useEffect(() => () => onActiveChange(null), [onActiveChange]);

  const navigate = (next: MenuView) => {
    setView(next);
    onNavigate(next.level === "resource");
  };
  const back = () => navigate(view.level === "resource" && view.back === "resources"
    ? { level: "category", category: "resources" } : { level: "root" });
  const enterResource = (resource: ResourceSnapshot) => navigate({ level: "resource", id: resource.ref.id,
    back: view.level === "root" ? "root" : "resources" });
  const activate = (row: MenuRow) => {
    switch (row.kind) {
      case "category": navigate({ level: "category", category: row.category }); break;
      case "skill": onSelect(row.skill.name, skillUrl(row.skill.name)); break;
      case "resource": onSelect(row.resource.title, resourceUrl(row.resource.ref.id, "")); break;
      case "target":
        if (selected) onSelect(`${selected.title}:${row.target.label}`, resourceUrl(selected.ref.id, row.target.location));
        break;
    }
  };
  const relevant = view.level === "root" ? (query.trim() ? "both" : "none") : view.level === "category" ? view.category : "targets";
  const loading = (relevant === "skills" || relevant === "both") && !skills
    || (relevant === "resources" || relevant === "both") && links.status === "loading"
    || relevant === "targets" && (links.status === "loading" || targets.status === "loading");
  const failed = (relevant === "skills" || relevant === "both") && skills?.failed
    || (relevant === "resources" || relevant === "both") && links.status === "error"
    || relevant === "targets" && (targets.status === "error" || (links.status !== "loading" && !provider));

  useImperativeHandle(ref, () => ({
    keyDown(event) {
      if (!present || composing || event.isComposing) return false;
      if (view.level !== "root" && !query.trim() && (event.key === "ArrowLeft" || event.key === "Backspace")) { back(); return true; }
      if (activeRow) {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          setActive((active + (event.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length);
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") { activate(activeRow); return true; }
        if (event.key === "ArrowRight") {
          if (activeRow.kind === "category") { activate(activeRow); return true; }
          if (activeRow.kind === "resource" && descriptions.get(activeRow.resource.ref.kind).referenceTargets) {
            enterResource(activeRow.resource); return true;
          }
        }
      }
      // Inside a resource, Enter is for selection even when there is no result to select.
      return (event.key === "Enter" && (loading || view.level === "resource")) || (event.key === "Tab" && loading);
    },
  }));

  const categoryLabel = (category: MenuCategory) => i18n.text(category === "skills" ? skillsMessages.category : messages.referenceResources);
  const categoryIcon = (category: MenuCategory) => category === "skills"
    ? <BookOpen className="size-4 shrink-0 text-folder-violet" /> : <Shapes className="size-4 shrink-0 text-muted-foreground" />;
  const title = view.level === "category" ? categoryLabel(view.category) : selected?.title ?? i18n.text(messages.referenceResources);
  const hint = loading ? commonMessages.loading : failed ? messages.referenceUnavailable
    : provider?.kind === "search" && targets.status === "idle" ? provider.prompt ?? messages.referenceSearchHint : commonMessages.noMatches;
  return <motion.div className="surface-floating absolute inset-x-0 bottom-full z-50 mb-1 origin-bottom overflow-hidden"
    {...commandSurfaceMotion(!!reducedMotion, "top")}
    inert={!present} aria-hidden={!present || undefined}
    style={{ ...commandMotionStyle, boxSizing: "content-box", height, transition: reducedMotion ? "none" : commandResizeTransition }}
    onMouseDown={event => event.preventDefault()}>
    <div ref={contentRef} className="w-full" style={height === undefined ? undefined : { position: "absolute", bottom: 0 }}>
      <div ref={body}>
        {view.level !== "root" && <div className="flex h-8 min-w-0 items-center gap-1 border-b px-1">
          <TooltipHint content={i18n.text(commonMessages.back)}><button type="button" tabIndex={-1} aria-label={i18n.text(commonMessages.back)}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={back}><ChevronLeft className="size-4" /></button></TooltipHint>
          {view.level === "category" ? categoryIcon(view.category) : selected && descriptions.get(selected.ref.kind).icon}
          <span className="type-label truncate">{title}</span>
        </div>}
        {!rows.length
          ? <p id={listId} className="type-caption p-2" role="status">{i18n.text(hint)}</p>
          // Padding sits outside the virtualized viewport so its height equals the rows' total and never scrolls early.
          : <div className="p-1"><VirtualList ref={list} data={rows} itemSize={rowHeight}
            viewportProps={{ id: listId, role: "listbox", "aria-label": i18n.text(messages.referenceMenu) }}
            style={{ height: Math.min(rows.length * rowHeight, maxListHeight) }}>
            {(row, index) => {
              const description = row.kind === "resource" ? descriptions.get(row.resource.ref.kind) : undefined;
              const icon = row.kind === "category" ? categoryIcon(row.category) : row.kind === "skill" ? categoryIcon("skills")
                : row.kind === "resource" ? description?.icon : <Link2 className="size-4 text-muted-foreground" />;
              const label = row.kind === "category" ? categoryLabel(row.category) : row.kind === "skill" ? row.skill.name
                : row.kind === "resource" ? row.resource.title : row.target.label;
              const detail = row.kind === "skill" ? row.skill.description : row.kind === "resource" && description ? i18n.text(description.label)
                : row.kind === "target" && row.target.detail ? i18n.text(row.target.detail) : undefined;
              const key = row.kind === "category" ? row.category : row.kind === "skill" ? row.skill.name
                : row.kind === "resource" ? row.resource.ref.id : row.target.location;
              return <div key={`${row.kind}:${key}`} id={optionId(index)} role="option" aria-selected={index === active}
                style={{ height: rowHeight }}
                className={cn("flex cursor-default items-center gap-2 rounded-sm px-2 text-sm select-none", index === active && "bg-accent text-accent-foreground")}
                onPointerMove={() => { if (index !== active) setActive(index); }} onClick={() => activate(row)}>
                <span className="shrink-0">{icon}</span>
                <TooltipHint content={detail || label}><span className="flex min-w-0 flex-1 flex-col">
                  <span className={cn("truncate leading-tight", row.kind !== "category" && "font-medium")} translate={row.kind === "category" ? undefined : "no"}>{label}</span>
                  {detail && <span className="type-caption truncate leading-tight text-muted-foreground">{detail}</span>}
                </span></TooltipHint>
                {row.kind === "category" && <>
                  <span className="type-caption tabular-nums">{row.count}</span><ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </>}
                {row.kind === "resource" && description?.referenceTargets && <TooltipHint content={i18n.formatMessage(messages.referenceEnterResource, { name: label })}>
                  <button type="button" tabIndex={-1} aria-label={i18n.formatMessage(messages.referenceEnterResource, { name: label })}
                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-background hover:text-foreground"
                    onClick={event => { event.stopPropagation(); enterResource(row.resource); }}><ChevronRight className="size-4" /></button>
                </TooltipHint>}
              </div>;
            }}
          </VirtualList></div>}
        {targets.status === "ready" && targets.limited && <p role="status" className="type-caption px-2 pb-2">{i18n.text(provider?.kind === "search" && provider.refineHint ? provider.refineHint : messages.referenceSearchLimited)}</p>}
        {!!rows.length && failed && <p role="status" className="type-caption px-2 pb-2">{i18n.text(messages.referenceUnavailable)}</p>}
      </div>
    </div>
  </motion.div>;
}
