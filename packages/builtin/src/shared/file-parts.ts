import type { ModelInputPart } from "@asterism-app/sdk/contracts";
import type { AgentInputPart } from "@asterism-app/builtin-api/contracts";

/** Captured content stays a model file; its resource address remains available for saving and forwarding. */
export function inputPartsToModel(parts: readonly AgentInputPart[]): ModelInputPart[] {
  return parts.flatMap((part): ModelInputPart[] => {
    if (part.kind === "file-reference") return [{ kind: "text", text: JSON.stringify(part) }];
    if (part.kind === "file" && part.ref) {
      const { file: _file, kind: _kind, ...metadata } = part;
      return [{ kind: "text", text: JSON.stringify({ kind: "file-reference", ...metadata }) }, part];
    }
    return [part];
  });
}
