import type { Json, CreationContract, ActionContract, ResourceCall } from "@asterism-app/sdk/contracts";
import type { ParsedCall } from "../plugins/commands.ts";
import type { Presentation } from "@asterism-app/sdk/contracts";
import type { LiveBlock } from "../shared/session.ts";
import type { FoldedObject } from "../session/fold.ts";
import type { ResourceRef } from "@asterism-app/sdk/runtime";
import type { ContentLease } from "../runtime/content-store.ts";

export interface ContextFile { file: string; text: string }
export interface ResourceCommandContext { sessionId: string; resource: FoldedObject; signal?: AbortSignal }
/**
 * Resource controller: behavior entry for resource cards. Resources own behavior; sessions only route commands and record events.
 * before first runs in the transaction where the resource commits its events, rechecking that the object remains on the current path,
 * or allowing composition entries such as home to create sessions and objects atomically; this check also runs after asynchronous preparation.
 */
export interface ResourceController {
  creationId?: string;
  creationContract?: CreationContract<unknown>;
  actionContracts?: readonly ActionContract<unknown>[];
  /** Check current action call chains before asynchronous preparation to avoid same-object reentry waiting on itself. */
  assertActionEntry?(objectId: string): void;
  /** External preparers run in assembly order before resource preparation; validate each replacement against the target schema. */
  prepareCommand?(input: ParsedCall, ref: ResourceRef, signal: AbortSignal): Promise<ParsedCall>;
  parseCommand?(input: ResourceCall): ParsedCall;
  /** Validate creation input, optionally reading configuration or files asynchronously, then pass the result to create. */
  prepareCreate?(input: ResourceCall, signal?: AbortSignal, content?: ContentLease): Promise<Json>;
  /** Run within the creation transaction: return the title and immutable resource data for the creation event, optionally saving private state too. */
  create?(sessionId: string, objectId: string, input: Json, content?: ContentLease): { title: string; data: Json };
  execute?(context: ResourceCommandContext, command: ParsedCall, before?: () => void): Promise<void>;
  /**
   * busy contains object IDs still depending on the current timeline path, including agents and other captured resources.
   * Persistent external-state activity does not count; session backtracking and object removal use this to determine settled state.
   * live contains only temporary model output; the host publishes progress notifications when activities start and end.
   */
  activity?(sessionId: string): { busy: string[]; live: LiveBlock[] };
  /** Describe available tools of linked resources when this object is the link destination. */
  linkTools?(sessionId: string, objectId: string, resource: FoldedObject): Json;
  close?(): Promise<void>;
}
/** Erased backend resource adapter interface; functions do not cross process boundaries. */
export interface ResourceBackend {
  kind: string;
  template?: import("@asterism-app/sdk/runtime").ResourceContribution["template"];
  card?: import("@asterism-app/sdk/contracts").CardAppearance;
  receivesLinks?: boolean;
  validateState?(data: Json): void;
  project(resource: FoldedObject): Presentation;
  inspect(resource: FoldedObject): Promise<Json>;
  context(resource: FoldedObject): Promise<ContextFile[]>;
  disposalWarning?(resource: FoldedObject): import("@asterism-app/sdk/contracts").UiText | null;
  /** Called by the host when an object enters the current set; lifetime end releases object-exclusive external instances. */
  attach?(resource: import("@asterism-app/sdk/contracts").ResourceSnapshot, lifetime: import("@asterism-app/sdk/runtime").Lifetime): void;
  controller?: ResourceController;
}
