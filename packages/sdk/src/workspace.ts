/** Shared workbench read contracts: consumable by both backend and frontend, independent of host storage and Node. */
import type { Json } from "./json.ts";
import type { ResourceContract } from "./module-contract.ts";
import type { SessionView } from "./records.ts";
import { z } from "zod";

/** Resource rename input; identity and external location do not change with the name. */
export const resourceTitleSchema = z.string().max(160).regex(/\S/u, "The title must contain non-whitespace text.");
export interface ResourceRef { readonly sessionId: string; readonly id: string; readonly kind: string }
/** Identity and title at committed creation; the title is a result summary and does not participate in resource identity validation. */
export interface ResourceCreationResult extends ResourceRef { readonly title: string }
export interface SessionSummary { readonly id: string; readonly title: string; readonly createdAt: string }
/** Archived session summary; archivedAt is the archival time, and startup cleanup deletes the session after the cooling-off period. */
export interface ArchivedSessionSummary extends SessionSummary { readonly archivedAt: string }
/**
 * Read-only session catalog shared within the same host runtime instance; each read returns current summaries.
 * list contains only active sessions; archived lists sessions in the recycle bin. Session IDs absent from both have been deleted, allowing plugins to clean up their own per-session data.
 */
export interface SessionDirectory { list(): readonly SessionSummary[]; archived(): readonly ArchivedSessionSummary[] }
/** Source: null means the application itself; plugin-originated sources always include plugin identity, and resource sources always belong to that plugin. Shared by records, events, and others. */
export type Source = { readonly plugin: string; readonly resource: ResourceRef | null } | null;
export interface ResourceSnapshot<S extends Json = Json> {
  readonly ref: ResourceRef;
  readonly title: string;
  readonly data: S;
}
/** Read-only observation handle with a fixed timeline tip and session read upper bound, distinct from the full tree and workbench projections in host IPC. */
export interface SessionSnapshot extends SessionView {
  readonly position: { readonly nodeId: string | null };
  readonly resources: {
    all(): readonly ResourceSnapshot[];
    get<S extends Json>(contract: ResourceContract<S>, id: string):
      | { status: "known"; resource: ResourceSnapshot<S> }
      | { status: "unknown"; resource: ResourceSnapshot; reason: "invalid_data" }
      | null;
  };
}
