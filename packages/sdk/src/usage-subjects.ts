import { z } from "zod";

const text = z.string().min(1);

/**
 * Something a model request or one of its tool calls used, declared by the plugin that knows the fact. The host records it in the usage
 * ledger with the request or call that is current where it is declared; the declaring plugin, session, and request come from that context.
 * `kind` and `relation` are open identifiers: the host interprets the kinds it owns (`usageSubjectKinds`) and shows other values verbatim.
 */
export const usageSubjectSchema = z.strictObject({
  kind: text,
  /** Identity within the kind, such as a skill name. */
  id: text,
  /** Owner scope within the kind, such as the skill source an entry resolved from; null when unresolved. */
  source: text.nullable().optional(),
  /** How the subject was used, such as `read` or `context` (`usageRelations`). */
  relation: text,
  /** Part within the subject, such as a package-relative file. */
  part: text.nullable().optional(),
  /** Non-negative amount in a kind-defined unit, such as prompt characters. */
  quantity: z.number().finite().nonnegative().nullable().optional(),
});
export type UsageSubject = z.input<typeof usageSubjectSchema>;

/** Kinds whose meaning the host owns. A `skill` subject's id is the skill name and its source the catalog source ID. */
export const usageSubjectKinds = {
  skill: "skill",
  /** A skill catalog projected into a request; quantity is its prompt characters. */
  skillCatalog: "skill-catalog",
  /** Execution unit context: id is the performer label/key, source its instance scope, and part the unit identity if available. */
  workUnit: "work-unit",
} as const;
/** Relations whose meaning the host owns: the model tried to read the subject, or it occupied request context. */
export const usageRelations = { read: "read", context: "context" } as const;
