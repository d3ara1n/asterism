import { createContext, useContext, type ReactNode } from "react";
import type { UiText } from "./i18n.ts";
import type { RendererApplicationServices } from "./renderer-services.ts";
import type { ResourceRef } from "./workspace.ts";
import type { RendererCalls } from "./renderer-calls.ts";
import type { RendererIsland } from "./renderer-island.ts";

export interface RendererResourceOpenOptions {
  readonly origin?: HTMLElement | null;
  /** A decoded URL fragment for in-app navigation, separate from the resource location. */
  readonly fragment?: string;
}

/** The resource interprets location and chooses its operation or view. Islands belong to the target plugin. */
export interface RendererResourceOpenContext extends RendererResourceOpenOptions {
  readonly resource: ResourceRef;
  readonly calls: RendererCalls;
  readonly island: RendererIsland;
}

export type RendererResourceOpener = (location: string, context: RendererResourceOpenContext) => boolean | Promise<boolean>;

/** A user-invoked location action. IDs are stable within a resource type; "open" is the host's in-app action. */
export interface RendererResourceLocationAction {
  readonly id: string;
  readonly label: UiText;
  readonly icon: ReactNode;
  run(options?: RendererResourceOpenOptions): void | boolean | Promise<void | boolean>;
}

/** Resources declare available actions; each action resolves its target when invoked. */
export type RendererResourceLocationActions = (location: string, context: {
  readonly resource: ResourceRef;
  readonly calls: RendererCalls;
  readonly application: RendererApplicationServices;
}) => readonly RendererResourceLocationAction[];

/** Current identity and title of a present resource; kind selects its presentation through useRendererResources. */
export interface RendererResourceIdentity { readonly ref: ResourceRef; readonly title: string }

export interface RendererResourceNavigation {
  /** Read the resource's current identity and title at call time; null when the session or resource is absent. Other failures reject. */
  resolve(resource: Pick<ResourceRef, "sessionId" | "id">): Promise<RendererResourceIdentity | null>;
  /** Resolve current presence and available location actions. The host supplies "open" when an in-app opener exists; resource actions retain their declared IDs. Lookup failures reject; action execution reports failures through the host. */
  actions(resource: Pick<ResourceRef, "sessionId" | "id">, location: string, options?: Pick<RendererResourceOpenOptions, "fragment">): Promise<readonly RendererResourceLocationAction[]>;
  /** Resolve current presence without model-request authorization. Failures are shown by the host; a cancelled open returns false. */
  open(resource: Pick<ResourceRef, "sessionId" | "id">, location: string, options?: RendererResourceOpenOptions): Promise<boolean>;
}

const Navigation = createContext<RendererResourceNavigation | null>(null);
export const RendererResourceNavigationProvider = Navigation.Provider;

/** Available in plugin cards, settings, Home entries, and islands. */
export function useRendererResourceNavigation(): RendererResourceNavigation {
  const navigation = useContext(Navigation);
  if (!navigation) throw new Error("Resource navigation must be provided by the host.");
  return navigation;
}
