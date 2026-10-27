import { runtime } from "../../runtime";
import { pluginOf, reference, type Json, type UiText } from "@asterism-app/sdk/contracts";
import { RendererPreferencesProvider, type CreationEntry, type CreationSource, type DropItem, type RendererContentInput } from "@asterism-app/sdk/renderer";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { errorDisplay } from "../../../shared/error-display.ts";
import type { Point } from "../../../shared/workbench";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { creationMessages } from "../../messages/creation";
import { RendererCatalogProvider } from "../../modules/object-context";
import { SlotBoundary } from "../../modules/SlotBoundary";
import { useModuleViews } from "../../modules/views";
import { useI18n } from "../../shared/i18n";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { Button } from "@asterism-app/ui/ui/button";
import { Checkbox } from "@asterism-app/ui/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@asterism-app/ui/ui/dialog";
import { Label } from "@asterism-app/ui/ui/label";
import { useStateToast } from "../../shared/toast";
import type { SessionController } from "../session/controller";
import type { WorkbenchCanvas } from "../workbench/canvas";
import { pluginPreferences, readPreference, writePreference } from "./preferences";
import { canDropKind, dropCandidates, rememberedEntry, routeKey, type DragKind } from "./routing";
import { contentInput, contentScopeId } from "./content";

type InputState = { entry: CreationEntry; source: CreationSource; initialInput?: Json; content: RendererContentInput; position: Point | null; done: (ok: boolean) => void };
type ChoiceState = { item: DropItem; candidates: CreationEntry[]; key: string; done: (entry: CreationEntry | null) => void };
type RunningState = { label: import("@asterism-app/sdk/contracts").UiText; requestId: string; sessionId: string; content?: RendererContentInput };

export interface CreationCoordinator {
  /** Menu entries in assembly order. */
  readonly menu: readonly CreationEntry[];
  readonly pending: boolean;
  open(entry: CreationEntry): void;
  canDrop(kinds: readonly DragKind[]): boolean;
  drop(items: readonly DropItem[], origin: Point): void;
  readonly element: ReactNode;
}

/**
 * Host creation coordinator: the sole creation entry shared by menus and drag-and-drop. Handles candidate arbitration, remembered routing, the shell for plugin input views,
 * placement, submission, and cancellation; plugin views receive only resolve/cancel and do not access a writable session.
 */
export function useCreationCoordinator({ controller, canvas, writable, ready }: {
  controller: SessionController | null; canvas: () => WorkbenchCanvas | null; writable: boolean; ready: boolean;
}): CreationCoordinator {
  const i18n = useI18n();
  const registry = useModuleViews();
  const [input, setInput] = useState<InputState | null>(null);
  const [choice, setChoice] = useState<ChoiceState | null>(null);
  const [running, setRunning] = useState<RunningState | null>(null);
  const [error, setError] = useState<UiText | null>(null);
  const [busy, setBusy] = useState(false);
  const drafts = useRef(new Set<RendererContentInput>());
  const submitting = useRef(new Set<RendererContentInput>());
  const pending = busy || input !== null || choice !== null;
  const latest = useRef({ controller, writable, pending, input, choice });
  latest.current = { controller, writable, pending, input, choice };
  useEffect(() => () => {
    for (const draft of drafts.current) void draft.close();
    drafts.current.clear();
    latest.current.input?.done(false);
    latest.current.choice?.done(null);
    setInput(null); setChoice(null);
  }, [controller]);

  /** Submit one creation with a request identity; the user can cancel during preparation. */
  const create = useCallback(async (entry: CreationEntry, value: Json, position: Point | null, content: RendererContentInput): Promise<boolean> => {
    if (submitting.current.has(content)) return false;
    const active = latest.current.controller;
    if (!active) return false;
    const kind = entry.contract.resource.kind;
    const placement = position ?? canvas()?.findPlacement({ kind })?.position ?? null;
    if (!placement) { setError(creationMessages.workbenchNotReady); return false; }
    const requestId = crypto.randomUUID();
    setError(null); setBusy(true);
    setRunning({ label: entry.label, requestId, sessionId: active.sessionId });
    submitting.current.add(content);
    try {
      const scopeId = await contentScopeId(content, { sessionId: active.sessionId, resourceKind: kind, contractId: entry.contract.id });
      const result = await active.execute({ type: "resource.create", sessionId: active.sessionId, kind,
        creation: reference(entry.contract), input: value, position: placement, requestId, contentScopeId: scopeId });
      if (!result.ok) setError(errorDisplay(result.error));
      return result.ok;
    } catch (error) {
      setError(errorDisplay({ code: "unavailable", message: error instanceof Error ? error.message : "Content input is unavailable." }));
      return false;
    } finally {
      submitting.current.delete(content);
      setBusy(false);
      setRunning(null);
    }
  }, [canvas]);
  const cancelRunning = useCallback(() => {
    if (running?.content) void running.content.close();
    else if (running) void runtime.session.execute({ type: "resource.create.cancel", sessionId: running.sessionId, requestId: running.requestId });
  }, [running]);

  const collect = useCallback((entry: CreationEntry, source: CreationSource, position: Point | null, content: RendererContentInput, initialInput?: Json) =>
    new Promise<boolean>(done => {
      setError(null); setInput({ entry, source, position, content, initialInput, done });
    }), []);

  /** Open the shell when an input view exists; otherwise produce input directly from the source. */
  const start = useCallback(async (entry: CreationEntry, source: CreationSource, position: Point | null) => {
    const active = latest.current.controller;
    if (!active) return false;
    const requestId = crypto.randomUUID();
    const content = contentInput({ sessionId: active.sessionId, resourceKind: entry.contract.resource.kind, contractId: entry.contract.id });
    drafts.current.add(content);
    try {
      setError(null); setBusy(true);
      setRunning({ label: entry.label, sessionId: active.sessionId, requestId, content });
      const value = source.kind === "menu" ? entry.triggers.menu?.initialInput : await entry.triggers.drop?.toInput(source.item, content);
      await contentScopeId(content, { sessionId: active.sessionId, resourceKind: entry.contract.resource.kind, contractId: entry.contract.id });
      setRunning(null);
      setBusy(false);
      if (entry.InputView) return await collect(entry, source, position, content, value ?? undefined);
      if (value === undefined || value === null) return false;
      return await create(entry, value as Json, position, content);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        setError(errorDisplay({ code: "unavailable", message: error instanceof Error ? error.message : "Content input is unavailable." }));
      return false;
    } finally {
      setRunning(null);
      setBusy(false);
      drafts.current.delete(content); await content.close();
    }
  }, [collect, create]);

  const choose = useCallback((item: DropItem, candidates: CreationEntry[]) => {
    const key = routeKey(item);
    const stored = readPreference(key);
    const remembered = rememberedEntry(candidates, typeof stored === "string" ? stored : null);
    if (remembered) return Promise.resolve(remembered);
    if (stored !== null) writePreference(key, null);
    if (candidates.length === 1) return Promise.resolve(candidates[0]!);
    return new Promise<CreationEntry | null>(done => setChoice({ item, candidates, key, done }));
  }, []);

  const drop = useCallback((items: readonly DropItem[], origin: Point) => {
    if (!latest.current.writable || latest.current.pending) return;
    void (async () => {
      // Route multiple dropped items individually, staggering placement; each starts after the preceding one completes.
      let index = 0;
      for (const item of items) {
        const candidates = dropCandidates(registry.creations, item);
        if (!candidates.length) continue;
        const entry = await choose(item, candidates);
        if (!entry) continue;
        const position = { x: origin.x + index * 32, y: origin.y + index * 32 };
        index++;
        await start(entry, { kind: "drop", item }, position);
      }
    })();
  }, [registry, choose, start]);

  const menu = useMemo(() => registry.creations.filter(entry => entry.triggers.menu), [registry]);
  const open = useCallback((entry: CreationEntry) => { if (latest.current.writable && !latest.current.pending) void start(entry, { kind: "menu" }, null); }, [start]);
  const canDrop = useCallback((kinds: readonly DragKind[]) => !latest.current.pending && kinds.some(kind => canDropKind(registry.creations, kind)), [registry]);

  const closeInput = (ok: boolean) => {
    if (busy) cancelRunning();
    setInput(current => { current?.done(ok); return null; });
    setError(null);
  };
  // Progress and errors outside the input dialog appear through transient notifications; while the dialog is open, errors remain inside it.
  useStateToast("creation-running", running && !input ? i18n.formatMessage(creationMessages.adding, { running_label: i18n.text(running.label) }) : null, {
    tone: "loading", action: { label: i18n.formatMessage(commonMessages.cancel), onClick: cancelRunning },
  });
  useStateToast("creation-error", error && !input && !running ? i18n.text(error) : null, { tone: "error", onDismiss: () => setError(null) });
  const View = input?.entry.InputView;
  const element = <>
    {input && View && <Dialog open onOpenChange={next => { if (!next) closeInput(false); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{i18n.text(input.entry.label)}</DialogTitle>
          <DialogDescription className={input.entry.description ? undefined : "sr-only"}>{i18n.text(input.entry.description ?? input.entry.label)}</DialogDescription>
        </DialogHeader>
        {error && <Alert variant="destructive"><AlertDescription>{i18n.text(error)}</AlertDescription></Alert>}
        <RendererCatalogProvider ready={ready}>
          <SlotBoundary><RendererPreferencesProvider value={pluginPreferences(pluginOf(input.entry.id)!)}>
            <View source={input.source} busy={busy || !writable} content={input.content}
              initialInput={input.initialInput}
              resolve={async value => {
                const ok = await create(input.entry, value, input.position, input.content);
                if (ok) { setInput(null); input.done(true); }
                return ok;
              }}
              cancel={() => closeInput(false)} />
          </RendererPreferencesProvider></SlotBoundary>
        </RendererCatalogProvider>
      </DialogContent>
    </Dialog>}
    {choice && <RouteChooser choice={choice} onDone={(entry, remember) => {
      if (entry && remember) writePreference(choice.key, entry.id);
      setChoice(null); choice.done(entry);
    }} />}
  </>;
  return { menu, pending, open, canDrop, drop, element };
}

/** When multiple entries accept the same dropped item, the user chooses and can remember the choice for that content type. */
function RouteChooser({ choice, onDone }: { choice: ChoiceState; onDone: (entry: CreationEntry | null, remember: boolean) => void }) {
  const i18n = useI18n();
  const [remember, setRemember] = useState(false);
  const subject = choice.item.kind === "file" ? choice.item.name : choice.item.kind === "url" ? choice.item.url : i18n.formatMessage(creationMessages.text);
  return <Dialog open onOpenChange={next => { if (!next) onDone(null, false); }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{i18n.formatMessage(creationMessages.addAs)}</DialogTitle>
        <DialogDescription className="break-all">{subject}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1">
        {choice.candidates.map(entry => <Button key={entry.id} variant="ghost" className="justify-start" onClick={() => onDone(entry, remember)}>
          {entry.icon}<span>{i18n.text(entry.label)}</span>
        </Button>)}
      </div>
      <DialogFooter className="items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Checkbox id="creation-route-remember" checked={remember} onCheckedChange={value => setRemember(value === true)} />
          <Label htmlFor="creation-route-remember">{i18n.formatMessage(creationMessages.rememberType)}</Label>
        </div>
        <Button variant="outline" onClick={() => onDone(null, false)}>{i18n.formatMessage(commonMessages.cancel)}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
