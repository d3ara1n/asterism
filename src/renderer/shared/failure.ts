import type { RendererFailure } from "../../shared/renderer-failure";

/** Explicit fatal reports preserve JavaScript and React stacks across the desktop bridge. */
export function reportRendererFailure(stage: RendererFailure["stage"], error: unknown, componentStack?: string | null): void {
  window.host.reportFailure({
    stage,
    message: error instanceof Error ? error.message : String(error),
    ...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
    ...(componentStack ? { componentStack } : {}),
  });
}
