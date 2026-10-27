import {
  definePlugin, implementResource, implementCreation,
  implementAction, implementTool, implementCall, type ObjectReader,
} from "@asterism-app/sdk/runtime";
import {
  ns, card, Counter, Value, View, Changed, Create, Increment,
  Settings, ReadStep, ReadCounter,
} from "./contracts.ts";

const current = (object: ObjectReader) => object.get(Value) ?? 0;

export default definePlugin({
  namespace: ns,
  setup(plugin) {
    const settings = plugin.config(Settings);
    return {
      calls: [implementCall(ReadStep, async () => settings.get().step)],
      resources: [implementResource(Counter, View, {
        card, records: [Changed],
        template: { current: [Value] },
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
