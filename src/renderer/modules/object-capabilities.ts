import type { RendererObjectContext } from "@asterism-app/sdk/renderer";
import { contentInput, contentReader } from "../features/creation/content";
import { objectRetention } from "../features/session/retention";
import { channels } from "../runtime";

/** Identity-bound capabilities can outlive a mounted object without retaining its controller or snapshot. */
export function objectCapabilities(sessionId: string, objectId: string, kind: string): Pick<RendererObjectContext, "ref" | "content" | "input" | "openChannel" | "retained"> {
  return {
    ref: { sessionId, id: objectId, kind },
    content: contentReader(() => ({ sessionId, objectId })),
    input: contract => contentInput({ kind: "resource", sessionId, resourceKind: contract.resource.kind, contractId: contract.id,
      ...(contract.kind === "action" ? { objectId } : {}) }),
    openChannel: contract => channels.open(contract, { sessionId, id: objectId, kind }),
    retained: objectRetention.object(sessionId, objectId),
  };
}
