import { useRef, useState } from "react";
import {
  defineRendererPlugin, cardRenderer, creationEntry, toolRenderer,
  useRendererObject, useRendererConfiguration, useRendererCalls, useI18n,
} from "@asterism/sdk/renderer";
import { ns, card, Counter, View, Create, Increment, Settings, ReadStep, ReadCounter } from "./contracts.ts";
import styles from "./panel.module.css";

function Operation({ label, disabled = false, run }: {
  label: string; disabled?: boolean; run(): Promise<void>;
}) {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <div>
    <button disabled={disabled || busy} onClick={() => {
      if (pending.current) return;
      pending.current = true; setBusy(true); setError("");
      void run().catch(error => setError(String(error))).finally(() => {
        pending.current = false; setBusy(false);
      });
    }}>{label}</button>
    {error && <p role="alert">{error}</p>}
  </div>;
}

function CounterBody({ data }: { data: number }) {
  const object = useRendererObject();
  const i18n = useI18n();
  return <div className={styles.panel}>
    <output>{data}</output>
    <Operation label="Increment" disabled={!object.view.ready} run={async () => {
      const receipt = await object.invoke(Increment, null);
      if (!receipt.ok) throw new Error(i18n.text(receipt.error.display ?? receipt.error.message));
    }} />
  </div>;
}

function SettingsPage() {
  const settings = useRendererConfiguration(Settings);
  const calls = useRendererCalls();
  const i18n = useI18n();
  const [reported, setReported] = useState<number | null>(null);
  return <div className={styles.panel}>
    <p>Step: {settings.value.step}</p>
    {settings.error && <p role="alert">{i18n.text(settings.error)}</p>}
    <Operation label="Toggle step between 1 and 2" disabled={!settings.ready}
      run={() => settings.save({ step: settings.value.step === 1 ? 2 : 1 })} />
    <Operation label="Read step from backend"
      run={async () => { setReported(await calls.invoke(ReadStep, null, {})); }} />
    <output>{reported}</output>
  </div>;
}

export default defineRendererPlugin({
  settings: { Body: SettingsPage },
  modules: [{
    resources: [{ kind: Counter.kind, label: "Counter", icon: null, card }],
    creations: [creationEntry(Create, {
      id: ns.name("create-menu"), label: "Counter",
      triggers: { menu: { initialInput: null } },
    })],
    cards: [cardRenderer(View, { ...card, Body: CounterBody })],
    tools: [toolRenderer(ReadCounter, {
      label: "Read counter",
      result: { bodyRenderer: ({ result }) => <output>{result.data ?? "—"}</output> },
    })],
  }],
});
