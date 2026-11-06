import { useRef, useState, type ReactNode } from "react";
import { Dialog } from "radix-ui";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useI18n } from "@asterism-app/sdk/renderer";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { cn } from "@asterism-app/ui/utils";
import { commandMessages } from "../../messages/command";
import { usePeekCommands } from "../peek/commands";
import { CommandPalette, firstEntry, type CommandHost, type CommandPage } from "./CommandPalette";
import { useSavedTextCommands } from "./saved-text";

const panelTransition = { duration: 0.18, ease: [0.2, 0.8, 0.2, 1] } as const;
const immediate = { duration: 0 } as const;

/** Each Agent view owns its keyboard scope and a command surface that is modal only within that view. */
export function AgentCommands({ children, composerHidden }: { children: ReactNode; composerHidden: boolean }) {
  const i18n = useI18n();
  const reducedMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  // List pages form a stack; a panel replaces the list and has no parent level.
  const [stack, setStack] = useState<readonly string[]>(["root"]);
  const [panel, setPanel] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [value, setValue] = useState("");
  const previousFocus = useRef<HTMLElement | null>(null);
  const restoreFocus = useRef(true);
  const scrim = useRef<HTMLDivElement>(null);

  const host: CommandHost = {
    openPage: id => navigate([...stack, id]),
    openPanel: id => setPanel(id),
    close,
  };
  const contributions = [usePeekCommands(host), useSavedTextCommands(host, composerHidden)];
  const busy = contributions.some(contribution => contribution.busy);
  const error = contributions.find(contribution => contribution.error)?.error;
  const pages: Record<string, CommandPage> = Object.assign({
    root: { id: "root", placeholder: i18n.text(commandMessages.placeholder), groups: contributions.flatMap(contribution => contribution.groups) },
  }, ...contributions.map(contribution => contribution.pages));
  const panels: Record<string, () => ReactNode> = Object.assign({}, ...contributions.map(contribution => contribution.panels));
  const page = pages[stack.at(-1)!];

  function navigate(next: readonly string[]) {
    setStack(next); setSearch(""); setValue(firstEntry(pages[next.at(-1)!]));
  }
  function show() {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    restoreFocus.current = true;
    setPanel(null);
    navigate(["root"]);
    setOpen(true);
  }
  function close() { if (!busy) setOpen(false); }
  const back = () => { if (stack.length > 1) navigate(stack.slice(0, -1)); };

  return <div tabIndex={-1} className="relative flex min-h-0 flex-1 flex-col outline-none [container-type:size]"
    onPointerDown={event => {
      if (!event.currentTarget.contains(event.target as Node)) return;
      // Blank content can own the shortcut without taking focus from controls or editors.
      if (!(event.target instanceof Element)) return;
      const control = event.target.closest("button, a, input, textarea, select, [contenteditable], [tabindex]");
      if (!control || control === event.currentTarget) event.currentTarget.focus({ preventScroll: true });
    }}
    onKeyDownCapture={event => {
      if (!event.currentTarget.contains(event.target as Node) || event.defaultPrevented || event.nativeEvent.isComposing
        || event.repeat || composerHidden || event.shiftKey || event.altKey
        || !event.ctrlKey || event.metaKey || event.key.toLowerCase() !== "k") return;
      event.preventDefault(); event.stopPropagation();
      if (open) close(); else show();
    }}>
    {children}
    <Dialog.Root open={open} modal={false} onOpenChange={next => { if (!next) close(); }}>
      <AnimatePresence>
        {open && <motion.div key="scrim" ref={scrim} aria-hidden
          className="nodrag nopan absolute inset-0 z-30 bg-background/40 backdrop-blur-[2px]"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={reducedMotion ? immediate : panelTransition} />}
        {open && <Dialog.Content key="panel" forceMount asChild aria-describedby={undefined}
          onKeyDown={event => event.stopPropagation()}
          onEscapeKeyDown={event => { event.preventDefault(); close(); }}
          onInteractOutside={event => {
            if (busy) { event.preventDefault(); return; }
            // Dismissing through the scrim returns to the previous control; other outside targets keep their own focus.
            restoreFocus.current = event.target === scrim.current;
          }}
          onCloseAutoFocus={event => {
            event.preventDefault();
            if (restoreFocus.current && previousFocus.current?.isConnected) previousFocus.current.focus({ preventScroll: true });
          }}>
          {/* The dialog node stays fixed: FocusScope restarts when it changes, restoring the opener's focus and dismissing as focus-outside.
              It spans the Agent view without taking pointer input, so outside presses still reach the scrim; the surface inside carries the exit motion. */}
          <div className="nodrag nopan nokey pointer-events-none absolute inset-0 z-40 outline-none">
            {/* Lists float near the top; a panel fills the Agent view within its margins. Switching remounts with an entry motion. */}
            <motion.div key={panel ?? "list"}
              className={cn("surface-floating pointer-events-auto absolute flex min-h-0 flex-col overflow-hidden",
                panel ? "inset-3" : "inset-x-3 top-[12%] mx-auto max-h-[calc(100%-12%-0.75rem)] max-w-lg")}
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: -4, transition: { duration: 0.12, ease: [0.4, 0, 1, 1] } }}
              transition={reducedMotion ? immediate : panelTransition}>
              {panel ? panels[panel]() : <>
                <Dialog.Title className="sr-only">{i18n.text(commandMessages.title)}</Dialog.Title>
                <CommandPalette page={page} depth={stack.length - 1} disabled={busy} search={search} onSearch={setSearch}
                  value={value} onValue={setValue} onBack={back} />
                {error && <Alert variant="destructive" className="m-2 mt-0 w-auto">
                  <AlertDescription>{i18n.text(error)}</AlertDescription>
                </Alert>}
              </>}
            </motion.div>
          </div>
        </Dialog.Content>}
      </AnimatePresence>
    </Dialog.Root>
  </div>;
}
