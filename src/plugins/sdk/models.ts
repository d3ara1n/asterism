import type { ModelServices } from "@asterism-app/sdk/runtime";
import type { RunGroup } from "../lifecycle.ts";
import type { PluginHostServices } from "../loader.ts";
import { inputReferences } from "../../model/input.ts";
import { declaredSubject } from "../../telemetry/subjects.ts";
import type { UsageSubject } from "@asterism-app/sdk/contracts";

/** Protocol execution accepts explicit inputs; workbench binding is supplied by the execution service. */
export function bindModels(owner: string, host: PluginHostServices, runs: RunGroup, checkAvailable: () => void): ModelServices {
  const subjects = (usage: readonly UsageSubject[] | undefined) => (usage ?? []).map(subject => declaredSubject(subject, owner));
  return {
    validate(request, options) {
      checkAvailable();
      return runs.start(signal => host.models.validate({ ...request, signal }, {
        content: messages => host.content?.captureReader(inputReferences(messages), options?.content, owner),
      }), { signal: request.signal, affectsHistory: false }).done;
    },
    stream(request, options) {
      checkAvailable();
      const declared = subjects(request.usage);
      return runs.iterate(signal => host.models.stream({ ...request, signal }, {
        content: messages => host.content?.captureReader(inputReferences(messages), options?.content, owner),
        telemetry: { pluginId: owner, purposeId: request.purpose ?? null, subjects: declared },
      }), request.signal);
    },
    run(request, options) {
      checkAvailable();
      const declared = subjects(request.usage);
      return runs.start(signal => host.models.run({ ...request, signal,
        content: messages => host.content?.captureReader(inputReferences(messages), options?.content, owner),
        telemetry: { pluginId: owner, purposeId: request.purpose ?? null, subjects: declared },
      }), { signal: request.signal, affectsHistory: false }).done;
    },
    list() { checkAvailable(); return host.models.list(); },
  };
}
