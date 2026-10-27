import { createContext, useContext, type ComponentType, type ReactNode } from "react";
import type { z } from "zod";
import type { CreationContract } from "./commands.ts";
import type { Json } from "./json.ts";
import type { RendererContentInput } from "./renderer-content.ts";

/**
 * Host snapshot of dropped content: the host reads it from DataTransfer at drop time, and it remains valid after the event ends.
 * The host resolves file paths through the desktop bridge; plugins cannot forge them.
 */
export type DropItem =
  /** Local drops carry a host-resolved path; sources without paths, such as clipboard images, contain only file bytes. */
  | { readonly kind: "file"; readonly file: File; readonly name: string; readonly mime: string; readonly directory: boolean; readonly path?: string }
  | { readonly kind: "url"; readonly url: string }
  | { readonly kind: "text"; readonly text: string };

/**
 * Declarative acceptance conditions: the host matches them synchronously during drag hover without calling plugin functions.
 * Extensions include a leading dot and use lowercase; MIME supports wildcards such as `image/*`.
 */
export interface DropAccepts {
  /** requiresPath accepts only items with a local path; directories implicitly requires a path. */
  readonly files?: { readonly requiresPath?: boolean; readonly directories?: boolean; readonly extensions?: readonly string[]; readonly mime?: readonly string[] };
  readonly urls?: { readonly schemes?: readonly string[] };
  readonly text?: boolean;
}

/** The source that triggered the entry point; menus have no payload. */
export type CreationSource = { readonly kind: "menu" } | { readonly kind: "drop"; readonly item: DropItem };

/** Plugin-owned preferences: the host isolates them by plugin and persists them in UI state; reads validate using the caller's schema. */
export interface RendererPreferences {
  get<T extends Json>(key: string, schema: z.ZodType<T>): T | null;
  set(key: string, value: Json | null): void;
}

/**
 * Input phase component: can render any UI, such as forms or previews, and can only return input or cancel.
 * resolve returns whether host creation succeeded; on failure the component stays open and the host shell displays the error.
 */
export interface CreationInputProps<I = Json> {
  readonly source: CreationSource;
  readonly initialInput?: I;
  readonly busy: boolean;
  readonly content: RendererContentInput;
  resolve(input: I): Promise<boolean>;
  cancel(): void;
}

export interface CreationEntry<I = Json> {
  /** Globally stable identity using the declaring plugin's namespace; routing memory stores this as its value. */
  readonly id: string;
  readonly contract: CreationContract<I, Json, Json>;
  readonly label: UiText;
  readonly description?: UiText;
  readonly icon?: ReactNode;
  /** Menu group; defaults to resources when omitted. */
  readonly group?: "agents" | "resources";
  readonly triggers: {
    readonly menu?: { readonly initialInput?: I };
    readonly drop?: { readonly accepts: DropAccepts; toInput(item: DropItem, content: RendererContentInput): I | null | Promise<I | null> };
  };
  /** When omitted, input is produced directly from the trigger source; menu sources must then provide initialInput. */
  readonly InputView?: ComponentType<CreationInputProps<I>>;
}

/** Type erasure occurs only at the registration boundary; call and component input types are inferred from the creation contract. */
export function creationEntry<I, O extends Json>(contract: CreationContract<I, Json, O>,
  definition: Omit<CreationEntry<NoInfer<I> & Json>, "contract">): CreationEntry {
  if (!definition.triggers.menu && !definition.triggers.drop) throw new Error(`Creation entry ${definition.id} declares no trigger.`);
  if (definition.triggers.menu && !definition.InputView && definition.triggers.menu.initialInput === undefined)
    throw new Error(`Creation entry ${definition.id} needs an InputView or a menu initialInput.`);
  return { ...definition, contract } as unknown as CreationEntry;
}

const Preferences = createContext<RendererPreferences | null>(null);
export const RendererPreferencesProvider = Preferences.Provider;
export function useRendererPreferences(): RendererPreferences {
  const value = useContext(Preferences);
  if (!value) throw new Error("Renderer preferences must be provided by the host.");
  return value;
}
import type { UiText } from "./i18n.ts";
