import * as Sentry from "@sentry/electron/renderer";

export function startCrashReports(): void {
  if (window.host?.crashReports.active) Sentry.init({ maxBreadcrumbs: 0,
    integrations: defaults => defaults.filter(integration => integration.name === "GlobalHandlers" || integration.name === "Dedupe"),
  });
}

export function captureInterfaceFailure(stage: "startup" | "render", error: unknown): void {
  if (window.host.crashReports.active) Sentry.captureException(error, { tags: { stage, "event.process": "renderer" } });
}
