# Build a small plugin

This example is a local counter plugin with a creation menu entry, a resource card, an action, a model tool, a settings page, and a typed frontend/backend call. Copy the named files into one package directory. The final sections show optional extensions; add them only when the plugin needs that capability.

## Package and type checking

The SDK supplies contracts and host capabilities. Shared declarations live in `contracts.ts`; backend work lives in `runtime.ts`; React views live in `renderer.tsx`. The host compiles the entries and loads their CSS after restart.

`package.json`:

```json
{
  "name": "asterism-example-counter",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": { "typecheck": "tsc --noEmit" },
  "peerDependencies": {
    "@asterism/sdk": "^0.46.0",
    "react": "^19.3.0",
    "react-intl": "^12.1.4",
    "zod": "^4.6.5"
  },
  "devDependencies": {
    "@asterism/sdk": "file:../asterism/packages/sdk",
    "typescript": "^7.0.2",
    "@types/node": "^26.6.1",
    "@types/react": "^19.3.0"
  },
  "asterism": {
    "id": "example.counter",
    "displayName": "Example counter",
    "runtime": "src/runtime.ts",
    "renderer": "src/renderer.tsx",
    "storage": "src/storage.ts"
  }
}
```

The local SDK path assumes a sibling Asterism checkout; adjust it to the available source package. The SDK is currently a private source package, so this example needs that package in addition to the installed application. Use the peer range compatible with the host's bundled SDK; the `file:` development dependency supplies editor types. The host supplies the running SDK and React instances.

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023", "DOM", "ESNext.Disposable"],
    "types": ["node"],
    "jsx": "react-jsx",
    "strict": true,
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

Install the package dependencies with `npm install`, then run `npm run typecheck`. A separate JavaScript build is optional. Dependencies used by plugin code must be installed or supplied through a documented host public package.

## Shared declarations

`src/contracts.ts`:

```ts
import { z } from "zod";
import {
  pluginNamespace, defineCreation, defineAction, defineCall,
  defineRecord, defineTool, defineImplementation,
} from "@asterism/sdk/contracts";

export const ns = pluginNamespace("example.counter");
export const card = { width: 280, height: 180 };
export const Counter = ns.resource("counter", z.strictObject({}));
export const Value = ns.data("value", z.number());
export const View = ns.data("view", z.number());
export const Changed = defineRecord(ns.name("changed"), { schema: z.number() });
export const Create = defineCreation(Counter, { id: ns.name("create"), schema: z.null() });
export const Increment = defineAction(Counter, { id: ns.name("increment"), schema: z.null() });
export const Settings = ns.config(
  z.strictObject({ step: z.number().int().min(1).max(10) }), { step: 1 },
);
export const ReadStep = defineCall(ns.name("read-step"), {
  scope: "plugin", input: z.null(), output: z.number(),
});
const Read = defineTool({
  id: ns.name("read-counter"), name: "read_counter",
  description: "Read the current value of a counter.", guidelines: [],
  argsSchema: z.null().describe("No arguments."),
});
export const ReadCounter = defineImplementation({
  ...ns.data("read-result", z.number().describe("The current counter value.")),
  resource: Counter, tool: Read,
  targetSchema: z.null().describe("The whole counter."),
  effect: "read", execution: "parallel",
});
```

Import these same declaration objects wherever they are used. The namespace identifies ownership; resource identity, projected card data, historical records, and tool results each have a distinct contract. Tool schemas describe what their values mean to a model.

## Backend contributions

`src/runtime.ts`:

```ts
import {
  definePlugin, implementResource, implementCreation,
  implementAction, implementTool, implementCall, type ObjectReader,
} from "@asterism/sdk/runtime";
import {
  ns, card, Counter, Value, View, Changed, Create, Increment,
  Settings, ReadStep, ReadCounter,
} from "./contracts.ts";

const current = (object: ObjectReader) => object.get(Value) ?? 0;

export default definePlugin({
  namespace: ns, version: "0.0.1",
  setup(plugin) {
    const settings = plugin.config(Settings);
    return {
      calls: [implementCall(ReadStep, async () => settings.get().step)],
      resources: [implementResource(Counter, View, {
        card, records: [Changed],
        creation: implementCreation(Create, {
          create: () => ({ title: "Counter", data: {} }),
        }),
        actions: [implementAction(Increment, {
          async execute(_input, object) {
            object.commit(writer => {
              const next = current(object) + settings.get().step;
              writer.set(Value, next);
              writer.append(Changed, next);
            });
          },
        })],
        project: (_data, object) => current(object),
        inspect: async (_data, object) => current(object),
      })],
      tools: [implementTool(ReadCounter, {
        async call(_data, _target, _args, { object }) {
          return { kind: "succeeded", data: current(object) };
        },
      })],
    };
  },
});
```

Setup registers contributions synchronously. Perform asynchronous I/O before entering `commit`; its callback is synchronous. `writer.set` stores the current value, while `writer.append` preserves a historical fact. This counter deliberately keeps its latest value when browsing history; restoration requires a domain implementation.

The resource tool becomes usable through the invoking agent's resource access, links, and tool policy. A card or tool registration alone grants no access. Split a growing backend into `defineModule(plugin => contributions)` modules and compose them through the plugin's `modules` array.

## Frontend, settings, and feedback

`src/renderer.tsx`:

```tsx
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
```

Views use public hooks and shared contracts. Resource actions return receipts that need checking; typed calls and configuration saves reject on failure. The button owns pending state for its entry point. Object services belong to the resource lifetime rather than the card's mount lifetime.

A creation entry without an input form supplies `initialInput`. An interactive form can instead use `InputView` and return validated input through its `resolve` callback. Card auxiliary views use `cardRenderer` panels; tool renderers can separately describe input previews, execution, and final results.

## Styles and stored configuration

`src/panel.module.css`:

```css
.panel { display: grid; gap: 8px; padding: 12px; color: var(--foreground); }
.panel button { font: inherit; }
```

`src/styles.d.ts`:

```ts
declare module "*.module.css" {
  const classes: Record<string, string>;
  export default classes;
}
```

The host loads imported CSS before frontend preparation. CSS Modules scope class names; ordinary CSS and global selectors share the application document. Use host theme variables and component-local rules. Tailwind or Sass belongs to the plugin toolchain and must generate CSS before the host builds the plugin.

`src/storage.ts`:

```ts
import { defineStorage } from "@asterism/sdk/runtime";
export default defineStorage([
  { kind: "json", path: ".asterism/config.json", version: 1, migrations: {} },
]);
```

The host imports storage declarations before runtime setup. Add consecutive migrations when a persistent format changes. Private files use `plugin.dir`; the optional managed database uses `plugin.db()` and a declaration for `.asterism/db.sqlite`. Credentials use `plugin.secrets`, while persistent byte content uses the bound executor's content service and typed references.

## Other small entry points

A context-wide tool goes in the backend contribution's `topLevelTools`. Import `defineTopLevelTool` from the runtime SDK; `z` and `ns` are the same schema library and namespace used above:

```ts
const echo = defineTopLevelTool({
  id: ns.name("echo"), name: "echo_text", description: "Return the supplied text.", guidelines: [],
  argsSchema: z.strictObject({ text: z.string() }).describe("Text to return."),
  resultSchema: z.string().describe("The unchanged text."),
  effect: "read", execution: "parallel",
  async execute({ text }) { return { kind: "succeeded", data: text }; },
});
```

For transient progress, declare the event in shared contracts and return it in the backend's `events` array:

```ts
export const Progress = ns.event("progress", {
  schema: z.object({ value: z.number() }), source: "resource",
  semantics: { kind: "snapshot", key: [] },
});
```

An object executor publishes with `object.events.publish(Progress, { value: 0.5 })`. In frontend `prepare({ events })`, subscribe and await readiness:

```ts
const subscription = events.subscribe(Progress, { delivery: "latest" }, event => {
  console.info("Counter progress:", event.data.value);
});
await subscription.ready;
```

Preparation subscriptions follow the frontend scope. Component subscriptions close in effect cleanup. Events are transient; subscribe before querying current state. For sustained bidirectional traffic, use `defineChannel`, backend `implementChannel`, and the bound view's `openChannel`.

For shared cleanup, register the release function when acquiring the resource. For example, inside backend setup with the `settings` handle above:

```ts
plugin.lifetime.defer(settings.subscribe(value => {
  plugin.log.info(`Counter step changed to ${value.step}.`);
}));
```

Object-owned work uses the resource's `attach(data, object, lifetime)` hook and `lifetime.defer`. Managed background work uses `plugin.tasks.start(key, async signal => { ... })`; pass cancellation to I/O and await its actual completion. Long operations affecting history use the host's execution/activity facilities.

Localized labels begin with shared messages; import `defineMessages` from the contracts SDK:

```ts
export const messages = ns.messages("en", defineMessages({
  counter: { id: "counter", defaultMessage: "Counter" },
}));
```

Use the message value in SDK label fields and `useI18n().text(messages.counter)` inside React. Declare translation files through `asterism.i18n.catalogs`, such as `{ "zh-Hans": "locales/zh-Hans.json" }`, with `{ "counter": "计数器" }` in that catalog. The sample's inline labels keep the wiring visible; localized plugins use messages for user-facing copy.

Agent-specific changes use `@asterism/builtin-api` with a compatible peer range and, during local development, a source-package dev dependency. Backend preparers wrap its original action contracts with `implementPreparer`. Frontend `prepare({ signal })` can register an extension component:

```ts
agentUI.register({ id: ns.name("agent-ui"), Component: Extension }, { signal });
```

Here `agentUI` comes from `@asterism/builtin-api/renderer`; `Extension` is the plugin's React component, bound to the displayed Agent. Model requests use `plugin.models.stream` or `plugin.models.run` with an explicit target, input, and cancellation signal. The plugin owns its conversation projection and history recording.

## Try the plugin

After type checking, add the package root in Settings and restart Asterism. Open its settings page, change the step, and read it back through the typed call. Create a Counter from the creation menu and increment it. Link the counter to an Agent and verify that its resource tool is available under that Agent's tool policy.

Edit the CSS, restart, and inspect the result. Check an invalid setting, disable and re-enable the plugin across restarts, and reopen the saved object. Type checking verifies SDK usage; actual application use verifies presentation, interaction, and lifecycle behavior.
