import { useEffect, useState } from "react";
import { defineMessages, pluginNamespace, type ProviderUsageState } from "@asterism-app/sdk/contracts";
import { useI18n } from "@asterism-app/sdk/renderer";
import { cn } from "./utils";

const messages = pluginNamespace("asterism.host").messages("en", defineMessages({
  updated: { id: "providerUsage.updated", defaultMessage: "Last updated: {time}" },
  expires: { id: "providerUsage.expires", defaultMessage: "Cache expires: {time}" },
  expired: { id: "providerUsage.expired", defaultMessage: "Cache expired: {time}" },
  previous: { id: "providerUsage.previous", defaultMessage: "Showing the last successful reading" },
}));

const dateOptions = { dateStyle: "medium", timeStyle: "short" } as const;
const maxTimeout = 2_147_483_647;

/** The deadline affects the display only. It never schedules a query. */
export function UsageReadingStatus({ state }: { state: ProviderUsageState }) {
  const i18n = useI18n();
  const { updatedAt, expiresAt, error } = state;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (expiresAt === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      const current = Date.now();
      setNow(current);
      if (current < expiresAt) timer = setTimeout(check, Math.min(expiresAt - current, maxTimeout));
    };
    check();
    return () => clearTimeout(timer);
  }, [expiresAt]);
  if (updatedAt === null) return null;
  const expired = expiresAt !== null && now >= expiresAt;
  return <div className="space-y-0.5 text-muted-foreground tabular-nums">
    <p>{i18n.formatMessage(messages.updated, { time: i18n.formatDate(updatedAt, dateOptions) })}</p>
    {expiresAt !== null && <p className={cn(expired && "text-warning")}>
      {i18n.formatMessage(expired ? messages.expired : messages.expires, { time: i18n.formatDate(expiresAt, dateOptions) })}</p>}
    {error && <p>{i18n.text(messages.previous)}</p>}
  </div>;
}
