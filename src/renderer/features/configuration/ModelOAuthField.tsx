import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { OAuthProviderId, UiText } from "@asterism-app/sdk/contracts";
import { errorMessages } from "@asterism-app/ui/error-display";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { Button } from "@asterism-app/ui/ui/button";
import { Field, FieldContent, FieldTitle } from "@asterism-app/ui/ui/field";
import { StatusText, type StatusTone } from "@asterism-app/ui/ui/status";
import { modelOAuthProviderNames, type ModelOAuthState } from "../../../shared/configuration";
import { errorDisplay } from "../../../shared/error-display";
import { providersMessages as messages } from "../../messages/providers";
import { runtime } from "../../runtime";
import { useI18n } from "../../shared/i18n";

/** The draft change to the saved grant: keep it, replace it with a completed authorization, or remove it. */
export type AuthorizationChange = { kind: "keep" } | { kind: "grant"; id: string } | { kind: "remove" };
type AuthorizationDraft = { change: AuthorizationChange; waiting: { url: string | null } | null };
const keep: AuthorizationChange = { kind: "keep" };

/** The value of the save command's authorization field: undefined keeps the saved grant and null removes it. */
export function authorizationField(change: AuthorizationChange): string | null | undefined {
  return change.kind === "grant" ? change.id : change.kind === "remove" ? null : undefined;
}

/**
 * Connecting and disconnecting edit the connection draft; the editor's Save commits the change. The editor owns a transient
 * authorization until its connection is saved, the change is discarded, or the editor closes.
 */
export function useModelOAuth() {
  const attempt = useRef<string | undefined>(undefined);
  const [draft, setDraft] = useState<AuthorizationDraft>({ change: keep, waiting: null });
  const [error, setError] = useState<UiText | null>(null);
  const release = useCallback(() => {
    const id = attempt.current;
    attempt.current = undefined;
    if (id) void runtime.configuration.execute({ type: "languageModelProvider.oauth.cancel", id }).catch(() => {});
  }, []);
  useEffect(() => release, [release]);

  const change = (next: AuthorizationChange) => { release(); setDraft({ change: next, waiting: null }); setError(null); };
  /** Stop waiting for the browser; the previous draft change remains. */
  const stopWaiting = () => {
    if (!draft.waiting) return;
    release();
    setDraft(previous => ({ change: previous.change.kind === "grant" ? keep : previous.change, waiting: null }));
  };
  const commit = () => { attempt.current = undefined; setDraft({ change: keep, waiting: null }); };
  const start = async (provider: OAuthProviderId, connectionId: string | null) => {
    if (draft.waiting) return;
    release();
    const id = crypto.randomUUID();
    attempt.current = id;
    setDraft(previous => ({ change: previous.change.kind === "grant" ? keep : previous.change, waiting: { url: null } }));
    setError(null);
    const fail = (message: UiText) => {
      if (attempt.current !== id) return;
      release();
      setDraft(previous => ({ ...previous, waiting: null }));
      setError(message);
    };
    try {
      const started = await runtime.configuration.execute({ type: "languageModelProvider.oauth.start", provider, id, connectionId });
      if (attempt.current !== id) return;
      if (!started.ok) { fail(errorDisplay(started.error)); return; }
      if (!started.authorizationUrl) { fail(errorMessages.unavailable); return; }
      const url = started.authorizationUrl;
      setDraft(previous => ({ ...previous, waiting: { url } }));
      window.open(url, "_blank", "noopener,noreferrer");
      const finished = await runtime.configuration.execute({ type: "languageModelProvider.oauth.finish", id });
      if (attempt.current !== id) return;
      if (!finished.ok) { fail(errorDisplay(finished.error)); return; }
      setDraft({ change: { kind: "grant", id }, waiting: null });
    } catch {
      fail(errorMessages.unavailable);
    }
  };
  return { draft, error, start, stopWaiting, change, commit };
}

/** One account row: the status the connection will have after saving, with the action that edits it. */
export function ModelOAuthField({ provider, state, draft, error, onConnect, onStopWaiting, onChange }: {
  provider: OAuthProviderId; state: ModelOAuthState | undefined; draft: AuthorizationDraft; error: UiText | null;
  onConnect(): void; onStopWaiting(): void; onChange(change: AuthorizationChange): void;
}) {
  const i18n = useI18n();
  const name = modelOAuthProviderNames[provider];
  const connect = (label: string) => <Button type="button" variant="outline" size="sm" onClick={onConnect}>{label}</Button>;
  const undo = <Button type="button" variant="ghost" size="sm" onClick={() => onChange(keep)}>{i18n.text(messages.oauthUndo)}</Button>;
  const [tone, status, actions]: [StatusTone, UiText, ReactNode] = draft.waiting
    ? ["progress", messages.oauthWaiting, <>
      {draft.waiting.url && <Button type="button" variant="outline" size="sm" asChild>
        <a href={draft.waiting.url} target="_blank" rel="noopener noreferrer">{i18n.text(messages.oauthReopen)}</a>
      </Button>}
      <Button type="button" variant="ghost" size="sm" onClick={onStopWaiting}>{i18n.text(commonMessages.cancel)}</Button>
    </>]
    : draft.change.kind === "grant" ? ["success", messages.oauthNeedsSave, undo]
      : draft.change.kind === "remove" ? ["neutral", messages.oauthRemovesOnSave, <>{undo}{connect(i18n.formatMessage(messages.oauthConnect, { provider: name }))}</>]
        : state === "connected" ? ["success", messages.oauthConnected,
          <Button type="button" variant="outline" size="sm" onClick={() => onChange({ kind: "remove" })}>{i18n.text(messages.oauthDisconnect)}</Button>]
          : state === "reauthorize" ? ["warning", messages.oauthNeedsReconnect, connect(i18n.text(messages.oauthReconnect))]
            : ["neutral", messages.oauthNotConnected, connect(i18n.formatMessage(messages.oauthConnect, { provider: name }))];
  return <Field orientation="horizontal" className="items-center">
    <FieldContent className="min-w-0 gap-1">
      <FieldTitle>{i18n.formatMessage(messages.oauthAccount, { provider: name })}</FieldTitle>
      <span role="status"><StatusText tone={tone}>{i18n.text(status)}</StatusText></span>
      {error && <StatusText tone="error">{i18n.text(error)}</StatusText>}
    </FieldContent>
    <div className="flex shrink-0 items-center gap-2">{actions}</div>
  </Field>;
}
