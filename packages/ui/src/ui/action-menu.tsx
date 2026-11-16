"use client";

import * as React from "react";
import { ContextMenu as ContextMenuPrimitive, DropdownMenu as DropdownMenuPrimitive, Slot } from "radix-ui";
import * as Dropdown from "./dropdown-menu";
import * as Context from "./context-menu";
import { cn } from "../utils";

type MenuKind = "dropdown" | "context";

type ActionMenuState = {
  id: string;
  kind: MenuKind;
  kindRef: React.RefObject<MenuKind>;
  targetRef: React.RefObject<HTMLElement | null>;
};

const ActionMenuContext = React.createContext<ActionMenuState | null>(null);
// Shared submenu helpers also work inside existing DropdownMenuContent.
const MenuKindContext = React.createContext<MenuKind>("dropdown");

function useActionMenu() {
  const menu = React.useContext(ActionMenuContext);
  if (!menu) throw new Error("ActionMenu components require an ActionMenu root.");
  return menu;
}

/** One logical menu, with mutually exclusive button and cursor-positioned presentations. */
function ActionMenu({
  children,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  modal,
  dir,
  ...props
}: React.ComponentProps<typeof Dropdown.DropdownMenu>) {
  const id = React.useId();
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = openProp ?? uncontrolledOpen;
  const [kind, setKind] = React.useState<MenuKind>("dropdown");
  const kindRef = React.useRef<MenuKind>(kind);
  const targetRef = React.useRef<HTMLElement | null>(null);

  function changeOpen(nextKind: MenuKind, nextOpen: boolean) {
    // A departing presentation cannot close the presentation that replaced it.
    if (!nextOpen && kindRef.current !== nextKind) return;
    if (nextOpen) {
      kindRef.current = nextKind;
      setKind(nextKind);
    }
    if (nextOpen !== open) {
      if (openProp === undefined) setUncontrolledOpen(nextOpen);
      onOpenChange?.(nextOpen);
    }
  }

  return <ActionMenuContext.Provider value={{ id, kind, kindRef, targetRef }}>
    <Dropdown.DropdownMenu {...props} dir={dir} modal={modal}
      open={open && kind === "dropdown"} onOpenChange={next => changeOpen("dropdown", next)}>
      <Context.ContextMenu dir={dir} modal={modal}
        open={open && kind === "context"} onOpenChange={next => changeOpen("context", next)}>
        {children}
      </Context.ContextMenu>
    </Dropdown.DropdownMenu>
  </ActionMenuContext.Provider>;
}

const controlSelector = [
  "button", "a[href]", "input", "select", "textarea", "option", "label", "summary",
  "[data-action-menu-trigger]", "[data-slot=dropdown-menu-trigger]",
  "audio[controls]", "video[controls]", "iframe", "[contenteditable]:not([contenteditable=false])",
  "[role=button]", "[role=link]", "[role=checkbox]", "[role=radio]", "[role=switch]",
  "[role=combobox]", "[role=listbox]", "[role=option]", "[role=slider]", "[role=spinbutton]",
  "[role=textbox]", "[role=searchbox]", "[role=tab]", "[role=treeitem]", "[role=scrollbar]",
  "[role=menuitem]", "[role=menuitemcheckbox]", "[role=menuitemradio]",
].join(",");
const primarySelector = "[data-slot=list-row-open], [data-action-menu-primary]";

function acceptsTarget(currentTarget: HTMLElement, target: EventTarget | null, id: string, blankOnly: boolean) {
  // React events from portals follow the component tree, not the target's DOM tree.
  if (!(target instanceof Element) || !currentTarget.contains(target)) return false;
  if (target.closest("[data-action-menu-target]") !== currentTarget) return false;
  const contextTrigger = target.closest("[data-slot=context-menu-trigger]");
  if (contextTrigger && contextTrigger !== currentTarget && currentTarget.contains(contextTrigger)) return false;
  if (target.closest("[role=menu], [data-slot=dropdown-menu-content], [data-slot=context-menu-content]")) return false;

  // Check each ancestor, so a control nested inside a primary navigation area is
  // still independent. An editable descendant never becomes a primary target.
  for (let element: Element | null = target; element; element = element.parentElement) {
    if (element.matches(controlSelector)) {
      const ownTrigger = element.getAttribute("data-action-menu-trigger") === id;
      const primary = element.matches(primarySelector) && !element.matches("input, select, textarea, [contenteditable]:not([contenteditable=false])");
      if (!ownTrigger && (blankOnly || !primary)) return false;
    }
    if (element === currentTarget) break;
  }
  return true;
}

type TargetGateProps = React.ComponentProps<"span"> & {
  asChild?: boolean;
  acceptsEvent: (event: React.SyntheticEvent<HTMLSpanElement>) => boolean;
  onTargetContextMenu?: React.MouseEventHandler<HTMLSpanElement>;
  onTargetPointerDown?: React.PointerEventHandler<HTMLSpanElement>;
};

function TargetGate({ asChild, acceptsEvent, onContextMenu, onPointerDown,
  onTargetContextMenu, onTargetPointerDown, ...props }: TargetGateProps) {
  const Component = asChild ? Slot.Root : "span";
  // Radix injects its opening/positioning handlers through asChild. Run the
  // caller first, then forward only eligible events to Radix; ignored targets
  // retain their native defaults and nested controls keep their own handlers.
  return <Component {...props}
    onContextMenu={event => {
      onTargetContextMenu?.(event);
      if (acceptsEvent(event)) onContextMenu?.(event);
    }}
    onPointerDown={event => {
      onTargetPointerDown?.(event);
      if (acceptsEvent(event)) onPointerDown?.(event);
    }} />;
}

/** Context trigger; blankOnly reserves controls other than its own menu button. */
function ActionMenuTarget({
  blankOnly = false,
  disabled = false,
  asChild,
  children,
  onContextMenu,
  onPointerDown,
  ...props
}: React.ComponentProps<typeof Context.ContextMenuTrigger> & { blankOnly?: boolean }) {
  const menu = useActionMenu();

  function acceptsEvent(event: React.SyntheticEvent<HTMLSpanElement>) {
    if (disabled || event.defaultPrevented || !acceptsTarget(event.currentTarget, event.target, menu.id, blankOnly)) return false;
    menu.targetRef.current = event.currentTarget;
    return true;
  }

  return <Context.ContextMenuTrigger {...props} data-action-menu-target={menu.id}
    asChild disabled={disabled}>
    <TargetGate asChild={asChild} acceptsEvent={acceptsEvent}
      onTargetContextMenu={onContextMenu} onTargetPointerDown={onPointerDown}>
      {children}
    </TargetGate>
  </Context.ContextMenuTrigger>;
}

function ActionMenuTrigger(props: React.ComponentProps<typeof Dropdown.DropdownMenuTrigger>) {
  const menu = useActionMenu();
  return <Dropdown.DropdownMenuTrigger {...props} data-action-menu-trigger={menu.id} />;
}

function restoreContextFocus(target: HTMLElement | null) {
  if (!target?.isConnected) return;
  const focusTarget = target.matches("button, a[href], input, select, textarea, [tabindex]")
    ? target
    : target.querySelector<HTMLElement>("[data-slot=list-row-open]:not(:disabled), [data-action-menu-primary]:not(:disabled):not([aria-disabled=true])") ?? target;
  const temporaryTabIndex = !focusTarget.hasAttribute("tabindex") && !focusTarget.matches("button, a[href], input, select, textarea");
  if (temporaryTabIndex) focusTarget.setAttribute("tabindex", "-1");
  focusTarget.focus({ preventScroll: true });
  if (temporaryTabIndex) focusTarget.removeAttribute("tabindex");
}

/** Declare children once; only the selected presentation mounts those children. */
function ActionMenuContent({ onCloseAutoFocus, ...props }: React.ComponentProps<typeof Dropdown.DropdownMenuContent>) {
  const menu = useActionMenu();
  const kind = menu.kind;

  function closeAutoFocus(event: Event) {
    const content = event.target instanceof HTMLElement ? event.target : null;
    const document = content?.ownerDocument ?? menu.targetRef.current?.ownerDocument;
    const previousFocus = document?.activeElement;
    onCloseAutoFocus?.(event);
    if (event.defaultPrevented) return;
    // Respect both explicit prevention and callbacks that move focus directly.
    if (menu.kindRef.current !== kind || document?.activeElement !== previousFocus) {
      event.preventDefault();
      return;
    }
    if (kind === "context") {
      event.preventDefault();
      // Dismissal by an outside control or an action opening another surface
      // already has a focus destination. Escape/selection instead returns here.
      const active = document?.activeElement;
      if (!active || active === document?.body || content?.contains(active)) {
        restoreContextFocus(menu.targetRef.current);
      }
    }
  }

  // Provider must wrap the declared children, not only the content component:
  // submenu helpers retain this selection through their own portals.
  return <MenuKindContext.Provider value={kind}>
    {kind === "context"
      ? <Context.ContextMenuContent {...props} side="right" align="start" sideOffset={2} alignOffset={0} onCloseAutoFocus={closeAutoFocus} />
      : <Dropdown.DropdownMenuContent {...props} onCloseAutoFocus={closeAutoFocus} />}
  </MenuKindContext.Provider>;
}

function ActionMenuItem(props: React.ComponentProps<typeof Dropdown.DropdownMenuItem>) {
  const Component = React.useContext(MenuKindContext) === "context" ? Context.ContextMenuItem : Dropdown.DropdownMenuItem;
  return <Component {...props} />;
}

function ActionMenuGroup(props: React.ComponentProps<typeof Dropdown.DropdownMenuGroup>) {
  const Component = React.useContext(MenuKindContext) === "context" ? Context.ContextMenuGroup : Dropdown.DropdownMenuGroup;
  return <Component {...props} />;
}

function ActionMenuSeparator(props: React.ComponentProps<typeof Dropdown.DropdownMenuSeparator>) {
  const Component = React.useContext(MenuKindContext) === "context" ? Context.ContextMenuSeparator : Dropdown.DropdownMenuSeparator;
  return <Component {...props} />;
}

function ActionMenuSub(props: React.ComponentProps<typeof Dropdown.DropdownMenuSub>) {
  const Component = React.useContext(MenuKindContext) === "context" ? Context.ContextMenuSub : Dropdown.DropdownMenuSub;
  return <Component {...props} />;
}

function ActionMenuSubTrigger({ className, ...props }: React.ComponentProps<typeof Dropdown.DropdownMenuSubTrigger>) {
  const Component = React.useContext(MenuKindContext) === "context" ? Context.ContextMenuSubTrigger : Dropdown.DropdownMenuSubTrigger;
  return <Component {...props} className={cn("gap-2", className)} />;
}

function ActionMenuSubContent(props: React.ComponentProps<typeof Dropdown.DropdownMenuSubContent>) {
  const context = React.useContext(MenuKindContext) === "context";
  // Both vendored submenu contents are inline. Portal beyond the parent menu's
  // scrolling/clipping boundary while retaining the adaptive provider context.
  return context
    ? <Context.ContextMenuPortal forceMount={props.forceMount}><Context.ContextMenuSubContent {...props} /></Context.ContextMenuPortal>
    : <Dropdown.DropdownMenuPortal forceMount={props.forceMount}><Dropdown.DropdownMenuSubContent {...props} /></Dropdown.DropdownMenuPortal>;
}

function ActionMenuCheckboxItem(props: React.ComponentProps<typeof Dropdown.DropdownMenuCheckboxItem>) {
  const Component = React.useContext(MenuKindContext) === "context" ? Context.ContextMenuCheckboxItem : Dropdown.DropdownMenuCheckboxItem;
  return <Component {...props} />;
}

function ActionMenuRadioGroup(props: React.ComponentProps<typeof Dropdown.DropdownMenuRadioGroup>) {
  const Component = React.useContext(MenuKindContext) === "context" ? Context.ContextMenuRadioGroup : Dropdown.DropdownMenuRadioGroup;
  return <Component {...props} />;
}

function ActionMenuRadioItem(props: React.ComponentProps<typeof Dropdown.DropdownMenuRadioItem>) {
  const Component = React.useContext(MenuKindContext) === "context" ? Context.ContextMenuRadioItem : Dropdown.DropdownMenuRadioItem;
  return <Component {...props} />;
}

function ActionMenuLabel(props: React.ComponentProps<typeof Dropdown.DropdownMenuLabel>) {
  const Component = React.useContext(MenuKindContext) === "context" ? Context.ContextMenuLabel : Dropdown.DropdownMenuLabel;
  return <Component {...props} />;
}

function ActionMenuItemIndicator(props: React.ComponentProps<typeof DropdownMenuPrimitive.ItemIndicator>) {
  const Component = React.useContext(MenuKindContext) === "context" ? ContextMenuPrimitive.ItemIndicator : DropdownMenuPrimitive.ItemIndicator;
  return <Component {...props} />;
}

export {
  ActionMenu,
  ActionMenuTarget,
  ActionMenuTrigger,
  ActionMenuContent,
  ActionMenuItem,
  ActionMenuGroup,
  ActionMenuSeparator,
  ActionMenuSub,
  ActionMenuSubTrigger,
  ActionMenuSubContent,
  ActionMenuCheckboxItem,
  ActionMenuRadioGroup,
  ActionMenuRadioItem,
  ActionMenuLabel,
  ActionMenuItemIndicator,
};
