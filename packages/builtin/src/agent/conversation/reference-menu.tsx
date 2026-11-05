import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { VList, type VListHandle } from "virtua";
import { BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
import { useI18n, useRendererCalls } from "@asterism-app/sdk/renderer";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { cn } from "@asterism-app/ui/utils";
import { SkillList } from "../../skills/contract";
import { skillsMessages } from "../../messages/skills";
import { conversationMessages } from "../../messages/conversation";
import { menuRows, type MenuRow, type MenuSkill, type MenuView } from "./reference-menu-model";

/** Keyboard input forwarded from the editor while the menu is open; focus stays in the editor. */
export interface ReferenceMenuHandle {
  /** Returns true when the key was consumed by the menu. */
  keyDown(event: KeyboardEvent): boolean;
}

const rowHeight = 40;
const maxListHeight = 7 * rowHeight;

export function ReferenceMenu({ ref, listId, query, onSelect, onActiveChange }: {
  ref: Ref<ReferenceMenuHandle>; listId: string; query: string;
  onSelect(skill: MenuSkill): void;
  /** DOM id of the active option for the editor's aria-activedescendant; null when nothing is active. */
  onActiveChange(id: string | null): void;
}) {
  const i18n = useI18n(), calls = useRendererCalls();
  const [skills, setSkills] = useState<readonly MenuSkill[] | null>(null);
  const [view, setView] = useState<MenuView>({ level: "root" });
  // The active row resets whenever the view or query changes the visible rows.
  const rowsKey = `${view.level}\u0000${query}`;
  const [activeState, setActiveState] = useState({ key: rowsKey, index: 0 });
  const list = useRef<VListHandle>(null);

  // The catalog can change between openings; read it each time the menu opens.
  useEffect(() => {
    const controller = new AbortController();
    calls.invoke(SkillList, {}, { signal: controller.signal })
      .then(setSkills, () => { if (!controller.signal.aborted) setSkills([]); });
    return () => controller.abort();
  }, [calls]);

  const rows = skills ? menuRows(view, query, skills) : [];
  const active = rows.length ? Math.min(activeState.key === rowsKey ? activeState.index : 0, rows.length - 1) : -1;
  const activeRow = active >= 0 ? rows[active] : undefined;
  const optionId = (index: number) => `${listId}-${index}`;
  const setActive = (index: number) => setActiveState({ key: rowsKey, index });

  // onActiveChange is stable for the menu's lifetime; only the active option drives this effect.
  const activeId = active >= 0 ? optionId(active) : null;
  useEffect(() => {
    if (active >= 0) list.current?.scrollToIndex(active, { align: "nearest" });
    onActiveChange(activeId);
  }, [active, activeId, onActiveChange]);
  useEffect(() => () => onActiveChange(null), [onActiveChange]);

  const activate = (row: MenuRow) => {
    if (row.kind === "category") setView({ level: "category", category: row.category });
    else onSelect(row.skill);
  };

  useImperativeHandle(ref, () => ({
    keyDown(event) {
      // Swallow submission while the catalog loads so Enter does not send a half-typed `@query`.
      if (skills === null) return event.key === "Enter" || event.key === "Tab";
      const inCategory = view.level === "category";
      if (inCategory && !query && (event.key === "ArrowLeft" || event.key === "Backspace")) {
        setView({ level: "root" });
        return true;
      }
      if (!activeRow) return false;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActive((active + step + rows.length) % rows.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") { activate(activeRow); return true; }
      if (event.key === "ArrowRight" && activeRow.kind === "category") { activate(activeRow); return true; }
      return false;
    },
  }));

  const skillLabel = i18n.text(skillsMessages.category);

  return <div className="surface-floating absolute inset-x-0 bottom-full z-50 mb-1 overflow-hidden"
    // Clicking the menu must not blur the editor, which would dismiss the suggestion.
    onMouseDown={event => event.preventDefault()}>
    {view.level === "category" && <div className="flex h-8 items-center gap-1 border-b px-1">
      <button type="button" tabIndex={-1} aria-label={i18n.text(commonMessages.back)} title={i18n.text(commonMessages.back)}
        className="inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        onClick={() => setView({ level: "root" })}><ChevronLeft className="size-4" /></button>
      <BookOpen className="size-3.5 text-folder-violet" />
      <span className="type-label">{skillLabel}</span>
      {skills && <span className="type-caption ml-auto px-2 tabular-nums">{skills.length}</span>}
    </div>}
    {skills === null
      ? <p className="type-caption p-2" role="status">{i18n.text(commonMessages.loading)}</p>
      : !rows.length
        ? <p className="type-caption p-2">{i18n.text(commonMessages.noMatches)}</p>
        // Padding sits outside the virtualized viewport so its height equals the rows' total and never scrolls early.
        : <div className="p-1"><VList ref={list} data={rows} itemSize={rowHeight} id={listId} role="listbox"
          aria-label={i18n.text(conversationMessages.referenceMenu)}
          style={{ height: Math.min(rows.length * rowHeight, maxListHeight) }}>
          {(row, index) => <div key={row.kind === "category" ? row.category : row.skill.name}
            id={optionId(index)} role="option" aria-selected={index === active}
            style={{ height: rowHeight }}
            className={cn("flex cursor-default items-center gap-2 rounded-sm px-2 text-sm select-none",
              index === active && "bg-accent text-accent-foreground")}
            onPointerMove={() => { if (index !== active) setActive(index); }}
            onClick={() => activate(row)}>
            <BookOpen className="size-4 shrink-0 text-folder-violet" />
            {row.kind === "category"
              ? <>
                <span className="min-w-0 flex-1 truncate">{skillLabel}</span>
                <span className="type-caption tabular-nums">{row.count}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </>
              // The row stays one fixed height; the full description is a native tooltip.
              : <span className="flex min-w-0 flex-1 flex-col" title={row.skill.description}>
                <span className="truncate font-medium leading-tight" translate="no">{row.skill.name}</span>
                <span className="type-caption truncate leading-tight">{row.skill.description}</span>
              </span>}
          </div>}
        </VList></div>}
  </div>;
}
