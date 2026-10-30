import { useEffect, useId, useState } from "react";
import type { UiText } from "@asterism-app/sdk/contracts";
import { Button } from "@asterism-app/ui/ui/button";
import { Input } from "@asterism-app/ui/ui/input";
import { ListRow } from "@asterism-app/ui/ui/list-row";
import { ItemGroup } from "@asterism-app/ui/ui/item";
import { RadioGroup, RadioGroupItem } from "@asterism-app/ui/ui/radio-group";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import {
  Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet, FieldTitle,
} from "@asterism-app/ui/ui/field";
import { failureDisplay } from "@asterism-app/ui/error-display";
import { networkPreferenceSchema, proxyAddress, type NetworkPreference, type NetworkState } from "../../../shared/network";
import { networkMessages as messages } from "../../messages/network";
import { useI18n } from "../../shared/i18n";
import { useIsland } from "../../shared/weave/Screen";
import { panelIslandWidth } from "../../shared/weave/IslandPanel";
import { Editor, ReadStatus } from "../configuration/forms";
import { Section } from "./layout";

type Mode = NetworkPreference["mode"];
const modes: readonly Mode[] = ["system", "direct", "custom"];
const islandId = "network-proxy";

/** The settings list shows the saved proxy and a pending restart; editing happens in an island and saves explicitly. */
export function NetworkSettings() {
  const i18n = useI18n(), island = useIsland();
  const [state, setState] = useState<NetworkState | null>(null);
  const [readError, setReadError] = useState<UiText | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [restarting, setRestarting] = useState(false);
  useEffect(() => {
    let active = true;
    const accept = (value: NetworkState) => { if (active) { setState(value); setReadError(null); } };
    const stop = window.host.network.onChanged(accept);
    void window.host.network.get().then(accept).catch(error => { if (active) setReadError(failureDisplay(error, messages.loadFailed)); });
    return () => { active = false; stop(); };
  }, [attempt]);

  const preference = state?.preference;
  const modeLabel = preference && i18n.text(messages[preference.mode]);
  const restart = () => {
    setRestarting(true);
    // The quit confirmation may cancel the restart; the button becomes available again.
    void window.host.startup.restart().finally(() => setRestarting(false));
  };
  return <Section title={i18n.text(messages.title)} hint={i18n.text(messages.summary)}>
    <ReadStatus loaded={!!state} error={readError} onRetry={() => { setReadError(null); setAttempt(value => value + 1); }} />
    {state && preference && <ItemGroup className="surface">
      <ListRow title={i18n.text(messages.proxy)}
        description={preference.mode === "custom" ? `${modeLabel} · ${preference.server}` : modeLabel}
        details={state.restartRequired ? i18n.text(messages.restartRequired) : undefined}
        selected={island.child === islandId}
        onOpen={origin => void island.open({ id: islandId, label: messages.proxy, width: panelIslandWidth, origin,
          render: () => <ProxyEditor saved={preference} /> })}
        actions={state.restartRequired && <Button size="sm" variant="outline" disabled={restarting} aria-busy={restarting} onClick={restart}>
          {restarting && <Spinner data-icon="inline-start" />}{i18n.text(messages.restartNow)}
        </Button>} />
    </ItemGroup>}
  </Section>;
}

/** Edits a working copy of the saved preference; Save validates the whole preference and closes on success. */
function ProxyEditor({ saved }: { saved: NetworkPreference }) {
  const i18n = useI18n(), island = useIsland(), id = useId();
  const [draft, setDraft] = useState(saved);
  const [serverInvalid, setServerInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiText | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const form = `${id}-form`;

  const save = async () => {
    // Outside custom mode the address is retained only when usable, so an unfinished edit does not block saving the mode.
    const next = draft.mode === "custom" ? draft : { ...draft, server: proxyAddress(draft.server) ?? saved.server };
    const parsed = networkPreferenceSchema.safeParse(next);
    if (!parsed.success) { setServerInvalid(true); return; }
    setBusy(true); setError(null);
    try {
      await window.host.network.set(parsed.data);
      void island.close({ force: true });
    } catch (failure) { setError(failureDisplay(failure, messages.saveFailed)); }
    finally { setBusy(false); }
  };

  return <Editor title={i18n.text(messages.proxy)} form={form} dirty={dirty} busy={busy} error={error}>
    <form id={form} className="space-y-6" onSubmit={event => { event.preventDefault(); void save(); }}>
      <fieldset disabled={busy} className="space-y-6">
        <FieldSet>
          <FieldLegend variant="label">{i18n.text(messages.mode)}</FieldLegend>
          <RadioGroup value={draft.mode} onValueChange={value => {
            const mode = modes.find(mode => mode === value);
            if (mode) { setDraft({ ...draft, mode }); setServerInvalid(false); }
          }}>
            {modes.map(mode => <FieldLabel key={mode} htmlFor={`${id}-${mode}`} className="w-full">
              <Field orientation="horizontal">
                <RadioGroupItem id={`${id}-${mode}`} value={mode} aria-describedby={`${id}-${mode}-hint`} />
                <FieldContent>
                  <FieldTitle>{i18n.text(messages[mode])}</FieldTitle>
                  <FieldDescription id={`${id}-${mode}-hint`}>{i18n.text(messages[`${mode}Hint`])}</FieldDescription>
                </FieldContent>
              </Field>
            </FieldLabel>)}
          </RadioGroup>
        </FieldSet>
        {draft.mode === "custom" && <FieldGroup>
          <Field data-invalid={serverInvalid}>
            <FieldLabel htmlFor={`${id}-server`}>{i18n.text(messages.server)}</FieldLabel>
            <Input id={`${id}-server`} value={draft.server} aria-invalid={serverInvalid}
              aria-describedby={`${id}-server-hint${serverInvalid ? ` ${id}-server-error` : ""}`}
              placeholder="http://127.0.0.1:7890" autoComplete="off" spellCheck={false} autoFocus={!draft.server}
              onChange={event => {
                const server = event.target.value;
                setDraft({ ...draft, server });
                if (serverInvalid && proxyAddress(server)) setServerInvalid(false);
              }} />
            <FieldDescription id={`${id}-server-hint`}>{i18n.text(messages.serverHint)}</FieldDescription>
            {serverInvalid && <FieldError id={`${id}-server-error`}>{i18n.text(messages.invalidServer)}</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-bypass`}>{i18n.text(messages.bypass)}</FieldLabel>
            <Input id={`${id}-bypass`} value={draft.bypass} aria-describedby={`${id}-bypass-hint`}
              placeholder="*.local,192.168.0.0/16" autoComplete="off" spellCheck={false}
              onChange={event => setDraft({ ...draft, bypass: event.target.value })} />
            <FieldDescription id={`${id}-bypass-hint`}>{i18n.text(messages.bypassHint)}</FieldDescription>
          </Field>
        </FieldGroup>}
      </fieldset>
      <p className="type-caption">{i18n.text(messages.externalHint)}</p>
    </form>
  </Editor>;
}
