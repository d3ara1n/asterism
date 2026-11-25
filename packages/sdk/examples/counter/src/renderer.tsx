import { useRef, useState } from "react";
import {
  defineRendererPlugin, cardRenderer, creationEntry, toolRenderer,
  useRendererObject, useRendererConfiguration, useRendererCalls, useI18n, type SessionEntryProps, useRendererIsland, IslandPanel,
} from "@asterism-app/sdk/renderer";
import { ns, card, Counter, View, Create, Increment, Settings, ReadStep, ReadCounter, StartSession } from "./contracts.ts";
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

function CounterEntry({ ready, open }: SessionEntryProps) {
  const calls = useRendererCalls(), retryKey = useRef<string | null>(null);
  return <Operation label="Start a counter workspace" disabled={!ready} run={async () => {
    retryKey.current ??= crypto.randomUUID();
    const sessionId = await calls.invoke(StartSession, { key: retryKey.current }, {});
    retryKey.current = null;
    open(sessionId);
  }} />;
}

function StepEditor() {
  const settings = useRendererConfiguration(Settings);
  const [draft, setDraft] = useState<number | null>(null);
  const step = draft ?? settings.value.step;
  const dirty = step !== settings.value.step;
  return <IslandPanel title="Counter step" dirty={dirty}
    action={<Operation label="Save" disabled={!dirty || !settings.ready} run={async () => {
      await settings.save({ step });
      setDraft(null);
    }} />}>
    <label>Increment by <input type="number" min={1} max={10} value={step}
      onChange={event => setDraft(event.currentTarget.valueAsNumber || 1)} /></label>
  </IslandPanel>;
}

function CounterOverview() {
  const island = useRendererIsland();
  const settings = useRendererConfiguration(Settings);
  return <section className={styles.panel}>
    <h2>Counter overview</h2>
    <button onClick={event => void island.open({
      key: "step-editor", label: "Counter step", origin: event.currentTarget, render: () => <StepEditor />,
    })}>Counter step: {settings.value.step}</button>
  </section>;
}

export default defineRendererPlugin({
  mainViews: [{ id: "overview", title: "Counter overview", Body: CounterOverview }],
  sessionEntries: [{ id: "counter", title: "Counter workspace", Body: CounterEntry }],
  settings: [{ id: "counter", title: "Counter", summary: "Configure the counter step.", Body: SettingsPage }],
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
