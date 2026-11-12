import { createContext, useContext } from "react";
import type { ResourceRef } from "./workspace.ts";
import type { RendererCalls } from "./renderer-calls.ts";
import type { RendererIsland } from "./renderer-island.ts";

export interface RendererResourceOpenOptions { readonly origin?: HTMLElement | null }

/** The resource interprets location and chooses its operation or view. Islands belong to the target plugin. */
export interface RendererResourceOpenContext extends RendererResourceOpenOptions {
  readonly resource: ResourceRef;
  readonly calls: RendererCalls;
  readonly island: RendererIsland;
}

export type RendererResourceOpener = (location: string, context: RendererResourceOpenContext) => boolean | Promise<boolean>;

/** Current identity and title of a present resource; kind selects its presentation through useRendererResources. */
export interface RendererResourceIdentity { readonly ref: ResourceRef; readonly title: string }

export interface RendererResourceNavigation {
  /** Read the resource's current identity and title at call time; null when the session or resource is absent. Other failures reject. */
  resolve(resource: Pick<ResourceRef, "sessionId" | "id">): Promise<RendererResourceIdentity | null>;
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
