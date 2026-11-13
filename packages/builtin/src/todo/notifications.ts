import { Agent } from "@asterism-app/builtin-api/contracts";
import type { ResourceSnapshot } from "@asterism-app/sdk/contracts";
import { actorKey, type Actor } from "./model.ts";

/** One route per stable Agent identity, independent of titles or the number of exposed entrances. */
export function notificationRoutes(
  entrances: Iterable<{ source: ResourceSnapshot; recipients: readonly ResourceSnapshot[] }>, actor: Actor,
): { source: ResourceSnapshot; recipient: ResourceSnapshot }[] {
  const seen = new Set<string>(), routes: { source: ResourceSnapshot; recipient: ResourceSnapshot }[] = [];
  if (actor.kind === "agent") seen.add(actorKey(actor));
  for (const { source, recipients } of entrances) {
    for (const recipient of recipients) {
      if (recipient.ref.kind !== Agent.kind) continue;
      const key = actorKey({ kind: "agent", ref: recipient.ref });
      if (seen.has(key)) continue;
      seen.add(key);
      routes.push({ source, recipient });
    }
  }
  return routes;
}
