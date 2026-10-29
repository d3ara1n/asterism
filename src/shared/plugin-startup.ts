import { z } from "zod";
import type { PluginMetadata } from "@asterism-app/sdk/contracts";

export const pluginDiagnosticSchema = z.object({
  stage: z.enum(["discovery", "build", "storage", "import", "setup", "validation", "dependency"]),
  message: z.string(),
  dependency: z.string().optional(),
});
export type PluginDiagnostic = z.infer<typeof pluginDiagnosticSchema>;

/** Package admission precedes backend assembly; ready packages are candidates, not active plugins. */
export interface PluginCandidate {
  source: string;
  enabled: boolean;
  id: string | null;
  status: "ready" | "disabled" | "invalid" | "failed";
  diagnostic?: PluginDiagnostic;
  metadata: PluginMetadata;
  metadataError?: string;
  renderer: string | null;
  stylesheet: string | null;
  dependencies: readonly string[];
  rendererDependencies: readonly string[];
}
export interface PluginOutcome extends Omit<PluginCandidate, "status"> {
  status: "loaded" | "disabled" | "invalid" | "failed";
}

export const pluginErrorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);
