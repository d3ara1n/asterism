import type { Json } from "./json.ts";
import type { ActionContract, CreationContract } from "./commands.ts";
import type { ResourceContract } from "./module-contract.ts";
import type { ContentReader } from "./content-runtime.ts";
import type { ObjectReader, ObjectWriter, SessionReader } from "./objects.ts";
import type { ResourceCreationResult } from "./workspace.ts";

declare const prepared: unique symbol;
/** Host-issued resource preparation, valid only within one session creation attempt. */
export interface PreparedCreation { readonly [prepared]: true }
export interface SessionPreparation {
  readonly signal: AbortSignal;
  prepare<I, S extends Json, O extends Json>(contract: CreationContract<I, S, O>, input: NoInfer<I> & Json): Promise<PreparedCreation>;
  /** Run action parsing and registered preparers for a resource awaiting initialization; this does not execute the action. */
  prepareAction<I, O extends Json>(resource: PreparedCreation, contract: ActionContract<I, O>, input: NoInfer<I> & Json): Promise<O>;
}
export interface ObjectInitializer extends ObjectReader {
  commit(work: (writer: ObjectWriter) => undefined): void;
}
export interface SessionInitializer extends SessionReader {
  /** Materialize each prepared resource once, preserving its preparation identity. */
  create(prepared: PreparedCreation): ResourceCreationResult;
  object<S extends Json>(contract: ResourceContract<S>, id: string): ObjectInitializer;
}
export interface SessionInitialization {
  title: string;
  /** Synchronous initialization commits session identity, resources, and initial records together. */
  initialize(session: SessionInitializer): undefined;
}
export interface SessionCreation {
  /** The key identifies one accepted creation within this plugin; retries return its existing session. */
  (key: string, prepare: (context: SessionPreparation) => Promise<SessionInitialization>, options?: {
    signal?: AbortSignal;
    content?: ContentReader;
  }): Promise<string>;
}
