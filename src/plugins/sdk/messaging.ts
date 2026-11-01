import type { Lifetime, MessagingServices, MessagingHandle } from "@asterism-app/sdk/runtime";
import type { ConnectionEvent } from "@asterism-app/sdk/contracts";
import type { MessagingRegistry } from "../../configuration/messaging.ts";
import type { RunGroup } from "../lifecycle.ts";
import type { SdkScope } from "./scope.ts";

export function bindMessaging(registry: MessagingRegistry, runs: RunGroup, lifetime: Lifetime, scope: SdkScope): MessagingServices {
  const subscribe = <T>(register: (listener: (value: T) => void) => () => void, listener: (value: T) => void) => {
    scope.checkAvailable();
    const unsubscribe = register(value => { scope.checkAvailable(); listener(value); });
    const release = () => { unsubscribe(); lifetime.signal.removeEventListener("abort", release); };
    lifetime.signal.addEventListener("abort", release, { once: true });
    return release;
  };
  return {
    types: () => { scope.checkAvailable(); return registry.types(); },
    connections: () => { scope.checkAvailable(); return registry.connections(); },
    subscribe: listener => subscribe<ConnectionEvent>(handler => registry.subscribe(handler), listener),
    subscribeConnections: listener => subscribe<void>(handler => registry.subscribeConnections(handler), listener),
    async resolve(id, { signal }) {
      scope.checkAvailable();
      const instance = await runs.start(signal => registry.resolve(id, { signal }), { signal, affectsHistory: false }).done;
      const run = <T>(signal: AbortSignal, work: (signal: AbortSignal) => Promise<T>) => {
        scope.checkAvailable();
        return runs.start(work, { signal, affectsHistory: false }).done;
      };
      return {
        listConversations: (query, { signal }) => run(signal, scope => instance.listConversations(query, { signal: scope })),
        readMessages: (query, { signal }) => run(signal, scope => instance.readMessages(query, { signal: scope })),
        sendMessage: (input, { signal }) => run(signal, scope => instance.sendMessage(input, { signal: scope })),
      } satisfies MessagingHandle;
    },
  };
}
