export interface RendererDiagnostic {
  stage: "dependency" | "style" | "import" | "prepare" | "module";
  message: string;
  module?: number;
}

/** Frontend outcomes belong to the current page and do not deactivate accepted backend services. */
export interface RendererOutcome {
  status: "ready" | "partial" | "failed";
  diagnostics: readonly RendererDiagnostic[];
}
