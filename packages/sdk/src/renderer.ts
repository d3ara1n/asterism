/** SDK renderer entry point: cards, tool views, and frontend capabilities bound to objects; React is shared by the host. */
import { createContext, createElement, useContext, type ComponentType, type ReactNode } from "react";
import type { UiText } from "./i18n.ts";
import type { CardAppearance } from "./card.ts";
export type { CardAppearance } from "./card.ts";
export * from "./renderer-i18n.ts";
import type { ActionContract, CreationContract } from "./commands.ts";
import type { Json } from "./json.ts";
import { reference, type ContractReference, type DataContract } from "./presentation.ts";
import type { ResourceRef, SessionSnapshot } from "./workspace.ts";
export * from "./renderer-services.ts";
export * from "./renderer-calls.ts";
export * from "./renderer-creation.ts";
export * from "./renderer-tools.ts";
export * from "./renderer-records.ts";
export * from "./renderer-card.ts";
export * from "./renderer-island.ts";
export * from "./renderer-view-state.ts";
import type { CardPanelDefinition, CardPanelView } from "./renderer-card.ts";
import type { RecordRenderer } from "./renderer-records.ts";
export type * from "./renderer-content.ts";
import type { RendererContentInput, RendererInputOptions } from "./renderer-content.ts";
import type { ContentReader } from "./content-runtime.ts";
export type { ContentReader } from "./content-runtime.ts";
import type { CreationEntry } from "./renderer-creation.ts";
import type { ToolRenderer } from "./renderer-tools.ts";
import type { EventSubscriber } from "./events.ts";
import type { PluginCalls } from "./calls.ts";
import type { ChannelContract, ChannelEnd, ChannelValue } from "./channels.ts";

/** The frontend end of a channel: messages are delivered in order and buffered until a listener registers; closed resolves when either end terminates. */
export interface RendererChannel<Up extends ChannelValue = ChannelValue, Down extends ChannelValue = ChannelValue> {
  send(data: Up): void;
  onMessage(listener: (data: Down) => void): () => void;
  close(): void;
  readonly closed: Promise<ChannelEnd>;
}

export type RendererReceipt = { ok: true } | { ok: false; error: { code: string; message: string; display?: UiText } };
/**
 * Frontend state retained per object, such as input drafts: survives card remounts, switches between focus containers, and session view disposal;
 * release is called when the object leaves the current session projection through removal or a cursor jump, or is explicitly discarded; state is not restored after application restart.
 */
export interface RendererRetained {
  /** Obtain the value for key, creating it with create on first access; the same object and key return the same instance. Prefix key with the plugin ID to avoid conflicts with other contributors. */
  get<T>(key: string, create: () => T, release?: (value: T) => void | Promise<void>): T;
  /** End retention immediately and call release; no effect if absent. */
  discard(key: string): void;
}
/** Frontend capabilities bound to a card object; the host handles subscriptions, command gating, and current-view consistency. */
export interface RendererObjectContext {
  readonly ref: ResourceRef;
  readonly content: ContentReader;
  input<I, O extends Json>(contract: ActionContract<I, O> | CreationContract<I, Json, O>): RendererContentInput;
  readonly view: {
    /** The current object view is operable; ordinary background refreshes and local commits on other objects do not change this value. */
    ready: boolean;
    /** View read error; object action and creation failures are returned through their respective call receipts. */
    error: UiText | null; missing: boolean;
  };
  readonly session: {
    snapshot(): SessionSnapshot | null;
    subscribe(listener: () => void): () => void;
    create<I, O extends Json>(contract: CreationContract<I, Json, O>, input: NoInfer<I> & Json, position: { x: number; y: number }, options?: RendererInputOptions): Promise<RendererReceipt>;
    refresh(): Promise<void>;
  };
  invoke<I, O extends Json>(contract: ActionContract<I, O>, input: NoInfer<I> & Json, options?: RendererInputOptions): Promise<RendererReceipt>;
  /** Open a duplex channel for this object; the host validates that it is on the current path and routes to its owning plugin. Ends when the object leaves the current set or the connection disconnects. */
  openChannel<Up extends ChannelValue, Down extends ChannelValue>(contract: ChannelContract<Up, Down>): RendererChannel<Up, Down>;
  /** Object-level retained state with a lifecycle managed uniformly by the host. */
  readonly retained: RendererRetained;
}
const ObjectContext = createContext<RendererObjectContext | null>(null);
export function useRendererObject(): RendererObjectContext {
  const object = useContext(ObjectContext);
  if (!object) throw new Error("The renderer must be bound to an object.");
  return object;
}

/** Static identification information at the type level; does not parse card data or create body components. */
export interface ResourceDescription {
  kind: string;
  label: UiText;
  icon: ReactNode;
  /** Default card dimensions available before creation, sharing a declaration with the card renderer. */
  card?: CardAppearance;
}
export interface CardView extends CardAppearance {
  body: ReactNode;
  actions?: ReactNode;
  panels?: readonly CardPanelView[];
}
export interface CardRenderer {
  contract: ContractReference;
  resolve(data: Json, context?: RendererObjectContext): CardView | null;
}
export interface RendererModule {
  resources: ResourceDescription[];
  cards: CardRenderer[];
  tools: ToolRenderer[];
  /** History record views: declare summaries, icons, and optional row content by record contract. */
  records?: RecordRenderer[];
  /** Creation entry points: the host arbitrates menus and drag-and-drop uniformly, with all paths ultimately using the bound creation contract. */
  creations?: CreationEntry[];
  /** Startup preparation: the host invokes modules in parallel before the first screen, and modules initialize their own internal resources; timeouts or failures are logged without blocking startup. */
  prepare?(context: RendererPrepareContext): Promise<void>;
}
export interface PluginSettingsPage {
  /** A directly addressable location within a page; an empty location means the root page. */
  locations?: readonly string[];
  Body: ComponentType<{ location?: string }>;
}
/** Frontend plugins own settings pages and shared service lifecycles; feature views are composed from modules. */
export interface RendererPlugin {
  modules?: readonly RendererModule[];
  settings?: PluginSettingsPage;
  prepare?(context: RendererPrepareContext): Promise<void>;
  closing?(): void | Promise<void>;
}
export function defineRendererPlugin(plugin: RendererPlugin): RendererPlugin { return plugin; }
export interface RendererPrepareContext {
  /** Typed calls for frontend module-level services; cancellation propagates with the preparation scope. */
  readonly calls: PluginCalls;
  /** Global subscriptions bound to the module lifecycle, cleaned up on failure, timeout, or application shutdown. */
  readonly events: EventSubscriber;
  /** Triggered when the host stops waiting due to timeout or shutdown; the module should stop promptly. */
  readonly signal: AbortSignal;
}

/** Type erasure occurs only at the registration boundary; components receive data that has passed contract validation. */
export function cardRenderer<T extends Json>(
  contract: DataContract<T>,
  definition: CardAppearance & {
    Body: ComponentType<{ data: T }>;
    Actions?: ComponentType<{ data: T }>;
    panels?: readonly CardPanelDefinition<T>[];
  },
): CardRenderer {
  const { Body, Actions, panels, ...appearance } = definition;
  const ids = new Set<string>();
  for (const panel of panels ?? []) {
    if (!panel.id.trim() || panel.id !== panel.id.trim()) throw new Error("Card panel IDs must be non-empty and trimmed.");
    if (ids.has(panel.id)) throw new Error(`Duplicate card panel ID: ${panel.id}`);
    ids.add(panel.id);
  }
  return { contract: reference(contract), resolve(raw, context) {
    const parsed = contract.schema.safeParse(raw);
    if (!parsed.success) return null;
    const bind = (node: ReactNode) => context ? createElement(ObjectContext.Provider, { value: context }, node) : node;
    return { ...appearance, body: bind(createElement(Body, { data: parsed.data })),
      actions: Actions ? bind(createElement(Actions, { data: parsed.data })) : undefined,
      panels: panels?.map(({ Body: PanelBody, ...panel }) => ({
        ...panel, body: bind(createElement(PanelBody, { data: parsed.data })),
      })) };
  } };
}
