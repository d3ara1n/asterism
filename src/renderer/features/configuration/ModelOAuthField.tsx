import { useCallback, useEffect, useRef, useState } from "react";
import type { OAuthProviderId, UiText } from "@asterism-app/sdk/contracts";
import { errorMessages } from "@asterism-app/ui/error-display";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { Button } from "@asterism-app/ui/ui/button";
import { Field, FieldContent, FieldDescription } from "@asterism-app/ui/ui/field";
import { StatusText } from "@asterism-app/ui/ui/status";
import { modelOAuthProviderNames, type ModelOAuthState } from "../../../shared/configuration";
import { errorDisplay } from "../../../shared/error-display";
import { providersMessages as messages } from "../../messages/providers";
import { runtime } from "../../runtime";
import { useI18n } from "../../shared/i18n";

type AuthorizationDraft = { stage: "idle" | "waiting" } | { stage: "authorized"; id: string };

/** The editor owns a transient authorization until its connection is saved or the editor closes. */
export function useModelOAuth() {
  const attempt = useRef<string | undefined>(undefined);
  const [draft, setDraft] = useState<AuthorizationDraft>({ stage: "idle" });
  const [error, setError] = useState<UiText | null>(null);
  const release = useCallback(() => {
    const id = attempt.current;
    attempt.current = undefined;
    if (id) void runtime.configuration.execute({ type: "languageModelProvider.oauth.cancel", id }).catch(() => {});
  }, []);
  useEffect(() => release, [release]);

  const cancel = () => {
    release();
    setDraft({ stage: "idle" });
    setError(null);
  };
  const commit = () => {
    attempt.current = undefined;
    setDraft({ stage: "idle" });
  };
  const start = async (provider: OAuthProviderId, connectionId: string | null) => {
    if (attempt.current) return;
    const id = crypto.randomUUID();
    attempt.current = id;
    setDraft({ stage: "waiting" });
    setError(null);
    const fail = (message: UiText) => { cancel(); setError(message); };
    try {
      const started = await runtime.configuration.execute({ type: "languageModelProvider.oauth.start", provider, id, connectionId });
      if (attempt.current !== id) return;
      if (!started.ok) { fail(errorDisplay(started.error)); return; }
      if (!started.authorizationUrl) { fail(errorMessages.unavailable); return; }
      window.open(started.authorizationUrl, "_blank", "noopener,noreferrer");
      const finished = await runtime.configuration.execute({ type: "languageModelProvider.oauth.finish", id });
      if (attempt.current !== id) return;
      if (!finished.ok) { fail(errorDisplay(finished.error)); return; }
      setDraft({ stage: "authorized", id });
    } catch {
      if (attempt.current === id) fail(errorMessages.unavailable);
    }
  };
  return { draft, error, start, cancel, commit };
}

export function ModelOAuthField({ provider, state, draft, error, disconnectDisabled, onConnect, onCancel, onDisconnect }: {
  provider: OAuthProviderId; state: ModelOAuthState | undefined; draft: AuthorizationDraft; error: UiText | null;
  disconnectDisabled: boolean; onConnect(): void; onCancel(): void; onDisconnect(): void;
}) {
  const i18n = useI18n();
  const name = modelOAuthProviderNames[provider];
  const status = draft.stage === "waiting" ? messages.oauthWaiting
    : draft.stage === "authorized" ? messages.oauthNeedsSave
      : state === "connected" ? messages.oauthConnected
        : state === "reauthorize" ? messages.oauthNeedsReconnect : null;
  return <Field orientation="horizontal">
    <FieldContent>
      <span className="type-label">{name}</span>
      {status && <FieldDescription role="status">{i18n.text(status)}</FieldDescription>}
      {error && <StatusText tone="error">{i18n.text(error)}</StatusText>}
    </FieldContent>
    {draft.stage !== "idle" ? <Button type="button" variant="outline" size="sm" onClick={onCancel}>{i18n.text(commonMessages.cancel)}</Button>
      : state === "connected" ? <Button type="button" variant="outline" size="sm" disabled={disconnectDisabled} onClick={onDisconnect}>{i18n.text(messages.oauthDisconnect)}</Button>
        : <Button type="button" variant="outline" size="sm" onClick={onConnect}>
          {state === "reauthorize" ? i18n.text(messages.oauthReconnect) : i18n.formatMessage(messages.oauthConnect, { provider: name })}
        </Button>}
  </Field>;
}
