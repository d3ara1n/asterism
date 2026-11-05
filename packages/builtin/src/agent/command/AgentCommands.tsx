import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Dialog } from "radix-ui";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Bookmark, BookmarkPlus, ScanSearch, TextQuote } from "lucide-react";
import { toast } from "sonner";
import { useI18n, useRendererObject } from "@asterism-app/sdk/renderer";
import { createPeekClient } from "@asterism-app/builtin-api/renderer";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { useSettingsAction } from "@asterism-app/ui/use-settings-action";
import { settingsMessages } from "../../settings/contract";
import { commandMessages } from "../../messages/command";
import { savedTextMessages } from "../../messages/saved-text";
import { savedTextName, useSavedText } from "../../saved-text/use-saved-text";
import { useConversationInteraction } from "../conversation/interaction";
import { CommandPalette, firstEntry, type CommandPage } from "./CommandPalette";
import { peekMessages } from "../../messages/peek";
import { createPeekConversation } from "../peek/conversation";
import { PeekPanel } from "../peek/PeekPanel";

type PageId = "root" | "saved-text";

const panelTransition = { duration: 0.18, ease: [0.2, 0.8, 0.2, 1] } as const;
const immediate = { duration: 0 } as const;

/** Each Agent view owns its keyboard scope and a command surface that is modal only within that view. */
export function AgentCommands({ children, composerHidden }: { children: ReactNode; composerHidden: boolean }) {
  const i18n = useI18n();
  const object = useRendererObject();
  const peek = object.retained.get("asterism.builtin/agent.peek", createPeekConversation, value => value.stop());
  const peekClient = createPeekClient(object);
  useEffect(() => () => peek.stop(), [peek]);
  const interaction = useConversationInteraction();
  const draft = useSyncExternalStore(interaction.draft.subscribe, interaction.draft.getSnapshot);
  const savedText = useSavedText();
  const { run, busy, error } = useSettingsAction(settingsMessages.saveFailed);
  const reducedMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [surface, setSurface] = useState<"commands" | "peek">("commands");
  const [stack, setStack] = useState<readonly PageId[]>(["root"]);
  const [search, setSearch] = useState("");
  const [value, setValue] = useState("");
  const previousFocus = useRef<HTMLElement | null>(null);
  const restoreFocus = useRef(true);
  const scrim = useRef<HTMLDivElement>(null);

  // Context conditions decide whether a command is shown; pending operations only disable it.
  const canInsert = !composerHidden && interaction.configurable && savedText.ready;
  const pending = busy || draft.locked || draft.uploading;
  const pages: Record<PageId, CommandPage> = {
    root: {
      id: "root", placeholder: i18n.text(commandMessages.placeholder),
      groups: [{
        id: "peek", heading: i18n.text(peekMessages.title),
        entries: [{
          id: "peek/explain", label: i18n.text(peekMessages.explain), icon: <ScanSearch />,
          disabled: busy || !object.view.ready,
          onSelect: () => setSurface("peek"),
        }],
      }, {
        id: "saved-text", heading: i18n.text(savedTextMessages.title),
        entries: [{
          id: "saved-text/insert", label: i18n.text(savedTextMessages.insert), icon: <TextQuote />,
          when: canInsert && savedText.items.length > 0, disabled: pending,
          submenu: true, onSelect: () => navigate([...stack, "saved-text"]),
        }, {
          id: "saved-text/save-input", label: i18n.text(savedTextMessages.saveInput), icon: <BookmarkPlus />,
          when: savedText.ready && draft.text.trim() !== "", disabled: busy,
          onSelect: () => {
            const content = interaction.draft.getSnapshot().text;
            const name = savedTextName(content);
            void run(() => savedText.save({ name, content })).then(result => {
              if (!result) return;
              toast.success(i18n.formatMessage(savedTextMessages.saved, { name }));
              close();
            });
          },
        }],
      }],
    },
    "saved-text": {
      id: "saved-text", title: i18n.text(savedTextMessages.title), placeholder: i18n.text(savedTextMessages.search),
      groups: [{
        id: "saved-text/items",
        entries: savedText.items.map(item => ({
          id: `saved-text/${item.id}`, label: item.name, detail: item.content.replace(/\s+/g, " ").trim(),
          icon: <Bookmark />, when: canInsert, disabled: pending,
          onSelect: () => {
            void run(() => interaction.insertSavedText(item.content)).then(result => { if (result?.value) close(); });
          },
        })),
      }],
    },
  };
  const page = pages[stack.at(-1)!];

  function navigate(next: readonly PageId[]) {
    setStack(next); setSearch(""); setValue(firstEntry(pages[next.at(-1)!]));
  }
  function show() {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    restoreFocus.current = true;
    setSurface("commands");
    navigate(["root"]);
    setOpen(true);
  }
  function close() { if (!busy) { peek.stop(); setOpen(false); } }
  const back = () => { if (surface === "commands" && stack.length > 1) navigate(stack.slice(0, -1)); else close(); };

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
        || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k") return;
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
          onEscapeKeyDown={event => { event.preventDefault(); back(); }}
          onInteractOutside={event => {
            if (busy) { event.preventDefault(); return; }
            // Dismissing through the scrim returns to the previous control; other outside targets keep their own focus.
            restoreFocus.current = event.target === scrim.current;
          }}
          onCloseAutoFocus={event => {
            event.preventDefault();
            if (restoreFocus.current && previousFocus.current?.isConnected) previousFocus.current.focus({ preventScroll: true });
          }}>
          <motion.div
            className="surface-floating nodrag nopan nokey absolute inset-x-3 top-[12%] z-40 mx-auto flex max-h-[calc(100%-12%-0.75rem)] min-h-0 max-w-lg flex-col overflow-hidden outline-none"
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: -4, transition: { duration: 0.12, ease: [0.4, 0, 1, 1] } }}
            transition={reducedMotion ? immediate : panelTransition}>
            {surface === "peek" ? <PeekPanel conversation={peek} client={peekClient} ready={object.view.ready} onClose={close} /> : <>
              <Dialog.Title className="sr-only">{i18n.text(commandMessages.title)}</Dialog.Title>
              <CommandPalette page={page} depth={stack.length - 1} search={search} onSearch={setSearch}
                value={value} onValue={setValue} onBack={back} />
              {(error || savedText.error) && <Alert variant="destructive" className="m-2 mt-0 w-auto">
                <AlertDescription>{i18n.text(error ?? savedText.error!)}</AlertDescription>
              </Alert>}
            </>}
          </motion.div>
        </Dialog.Content>}
      </AnimatePresence>
    </Dialog.Root>
  </div>;
}
