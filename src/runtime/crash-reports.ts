import * as Sentry from "@sentry/electron/utility";
import { crashReportsArgument } from "../shared/crash-reports.ts";

export function utilityCrashReports(stage: "runtime" | "preparation") {
  const active = process.argv.at(-1) === crashReportsArgument;
  if (active) {
    Sentry.init({ maxBreadcrumbs: 0, initialScope: { tags: { stage } },
      integrations: defaults => defaults.filter(integration => integration.name === "OnUncaughtException" || integration.name === "OnUnhandledRejection"),
    });
  }
  return async (error: unknown) => {
    if (!active) return;
    Sentry.captureException(error);
    // Give the utility's IPC transport time to hand off the event before the parent terminates it.
    await Sentry.flush(1_000);
  };
}
