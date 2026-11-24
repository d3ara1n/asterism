import { useEffect, useRef, useState } from "react";
import { useI18n, useRendererResourceNavigation, type RendererResourceLocationAction } from "@asterism-app/sdk/renderer";
import type { ResourceRef, UiText } from "@asterism-app/sdk/contracts";
import { failureDisplay } from "./error-display";
import { commonMessages } from "./messages/common";
import { IconButton } from "./ui/icon-button";
import { Spinner } from "./ui/spinner";

/** Resolve capabilities when the surface opens; actions resolve their actual targets when clicked. */
export function useResourceLocationActions(resource: Pick<ResourceRef, "sessionId" | "id">, location: string, enabled = true, fragment?: string) {
  const navigation = useRendererResourceNavigation();
  const { sessionId, id } = resource;
  const [actions, setActions] = useState<readonly RendererResourceLocationAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<UiText | null>(null);
  const running = useRef(false);
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setLoading(true); setActions([]); setError(null);
    navigation.actions({ sessionId, id }, location, { fragment }).then(
      value => { if (active) { setActions(value); setLoading(false); } },
      failure => { if (active) { setError(failureDisplay(failure, commonMessages.referenceUnavailable)); setLoading(false); } },
    );
    return () => { active = false; };
  }, [navigation, sessionId, id, location, enabled, fragment]);
  const run = async (action: RendererResourceLocationAction, origin?: HTMLElement | null) => {
    if (running.current) return;
    running.current = true;
    setPending(action.id);
    try { await action.run({ origin }); }
    finally { running.current = false; setPending(null); }
  };
  return { actions, loading, error, pending, run };
}

/** Additional actions belong to the source, so they remain available when no internal preview exists. */
export function ResourceLocationActions({ resource, location }: { resource: ResourceRef; location: string }) {
  const i18n = useI18n();
  const { actions, loading, error, pending, run } = useResourceLocationActions(resource, location);
  if (loading) return <Spinner aria-label={i18n.text(commonMessages.loading)} />;
  if (error) return <span className="type-caption text-destructive" role="alert">{i18n.text(error)}</span>;
  return <>{actions.filter(action => action.id !== "open").map(action => <IconButton key={action.id} label={i18n.text(action.label)}
    disabled={pending !== null} aria-busy={pending === action.id} onClick={() => void run(action)}>
    {pending === action.id ? <Spinner /> : action.icon}
  </IconButton>)}</>;
}
