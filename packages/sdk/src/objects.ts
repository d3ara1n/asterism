import type { Json } from "./json.ts";
import type { DataContract, Presentation } from "./presentation.ts";
import type { RecordContract, OperationRecordContract } from "./records.ts";
import type { ResourceRef, ResourceCreationResult, ResourceSnapshot, SessionSnapshot } from "./workspace.ts";
import type { ContentReader, ContentScope } from "./content-runtime.ts";
import type { EventPublisher } from "./events.ts";
import type { ActionContract, CreationContract } from "./commands.ts";

export interface ResourceCreationOptions {
  signal?: AbortSignal;
  /** Read eligibility for content referenced by the input; defaults to the current session content facade when omitted. */
  content?: ContentReader;
  /** Link the new resource to this recipient, committed atomically with creation. */
  linkTo?: ResourceRef;
  /** Initial resource links received by the new resource, committed atomically with creation. */
  resources?: readonly ResourceRef[];
}
export interface ResourceActionOptions {
  signal?: AbortSignal;
  /** The valid content source for this action's input; defaults to the caller's bound session/object content facade when omitted. */
  content?: ContentReader;
}

/** Data and event writes within a synchronous transaction; the host limits the validity of writer calls. */
export interface SessionWriter {
  /** Append to the current timeline tip at commit time and advance the cursor; previously obtained read-only snapshots do not determine the append position. */
  append<T extends Json>(contract: RecordContract<T>, data: NoInfer<T>): string;
  /** Publish an operation's immutable input at the current timeline tip, with its result still pending. */
  begin<I extends Json, O extends Json>(contract: OperationRecordContract<I, O>, input: NoInfer<I>): string;
  /** Complete a pending operation on any branch without moving the cursor. Object writers require the same emitting object. */
  complete<I extends Json, O extends Json>(contract: OperationRecordContract<I, O>, id: string, output: NoInfer<O>, options?: { content?: ContentReader }): void;
  set<T extends Json>(contract: DataContract<T>, data: NoInfer<T>): void;
}
export type ObjectWriter = SessionWriter;
export interface SessionReader {
  readonly id: string;
  readonly content: ContentReader;
  snapshot(): SessionSnapshot;
  get<T extends Json>(contract: DataContract<T>): T | null;
  readonly title: { get(): string };
}
/** Generic execution facade at the session level; resource operations use explicit references, and the specific call entry point binds the caller's perspective. */
export interface SessionExecutor extends SessionReader {
  create<I, S extends Json, O extends Json>(contract: CreationContract<I, S, O>, input: NoInfer<I> & Json, options?: ResourceCreationOptions): Promise<ResourceCreationResult>;
  /** Invoke a resource's public action; returning means action handling is complete, while the resource manages any independent managed work itself. */
  invoke<I, O extends Json>(contract: ActionContract<I, O>, target: ResourceRef, input: NoInfer<I> & Json, options?: ResourceActionOptions): Promise<void>;
  /** Link a resource to a recipient; both ends are resources, and the recipient's resource type declares support for receiving links. */
  link(receiver: ResourceRef, resource: ResourceRef): void;
  /** Unlink the specified direction; the reverse link remains independently. */
  unlink(receiver: ResourceRef, resource: ResourceRef): void;
  /** Remove a settled object and all its links; preserve history and external entities. */
  remove(resource: ResourceRef): void;
  /** Append a resource rename event when the title changes; return the title with leading and trailing whitespace removed. */
  rename(resource: ResourceRef, title: string): string;
  commit(work: (writer: SessionWriter) => undefined): void;
  /** Append a host title assignment atomically, with optional plugin-owned detail. */
  readonly title: SessionReader["title"] & { set(text: string, detail?: Presentation): void };
}
/**
 * An operation facade for the same session from the perspective of the tool caller and this request.
 * The host binds the originating resource, the effective link scope at request start, and the tool execution scope, handling identity and execution validation consistently.
 * Operations originate from the initiating resource: newly created resources link to it, while removal and rename targets resolve within this request's effective link scope.
 * New operations use this perspective, explicitly defining implicitly bound endpoints, the operable resource scope, and the execution scope.
 */
export interface ToolSession extends SessionReader {
  create<I, S extends Json, O extends Json>(contract: CreationContract<I, S, O>, input: NoInfer<I> & Json, options?: {
    resources?: readonly string[];
    /** Link the bound initiator to the new resource, committed atomically with creation; defaults to false when omitted. */
    exposeSelf?: boolean;
  }): Promise<ResourceCreationResult>;
  remove(resourceId: string): void;
  rename(resourceId: string, title: string): string;
}
export interface ObjectReader {
  readonly ref: ResourceRef;
  readonly content: ContentReader;
  readonly session: SessionReader;
  /** The resource snapshot bound to the call; null when identity has not yet been established within the creation transaction. */
  snapshot(): ResourceSnapshot | null;
  /** Current data is independent of the fixed snapshot and is not restored by cursor rewinding or branching. */
  get<T extends Json>(contract: DataContract<T>): T | null;
}
export interface ObjectExecutor extends ObjectReader {
  readonly events: EventPublisher;
  /** Staging is valid only within the host execution scope; reads are validated against content already owned by the object or supplied in this input. */
  readonly content: ContentScope;
  readonly session: SessionExecutor;
  commit(work: (writer: ObjectWriter) => undefined): void;
  /** Mark asynchronous work that depends on the current timeline path; nested holds release independently, and cancellation waits for work to actually end. */
  withBusy<T>(work: (signal: AbortSignal) => Promise<T>, options?: { signal?: AbortSignal }): Promise<T>;
  /** Notify the host to query the projection again after in-memory display data changes; does not append history or save resource data. */
  invalidate(): void;
}
