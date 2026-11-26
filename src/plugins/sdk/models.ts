import type { LanguageModelServices } from "@asterism-app/sdk/runtime";
import type { RunGroup } from "../lifecycle.ts";
import type { PluginHostServices } from "../loader.ts";
import { inputReferences } from "../../model/input.ts";
import { declaredSubjects } from "../../telemetry/subjects.ts";

/** Protocol execution accepts explicit inputs; workbench binding is supplied by the execution service. */
export function bindLanguageModels(owner: string, host: PluginHostServices, runs: RunGroup, checkAvailable: () => void): LanguageModelServices {
  return {
    validate(request, options) {
      checkAvailable();
      return runs.start(signal => host.languageModels.validate({ ...request, signal }, {
        content: messages => host.content?.captureReader(inputReferences(messages), options?.content, owner),
      }), { signal: request.signal, affectsHistory: false }).done;
    },
    stream(request, options) {
      checkAvailable();
      const declared = declaredSubjects(request.usage, owner);
      return runs.iterate(signal => host.languageModels.stream({ ...request, signal }, {
        content: messages => host.content?.captureReader(inputReferences(messages), options?.content, owner),
        telemetry: { pluginId: owner, purposeId: request.purpose ?? null, subjects: declared },
      }), request.signal);
    },
    run(request, options) {
      checkAvailable();
      const declared = declaredSubjects(request.usage, owner);
      return runs.start(signal => host.languageModels.run({ ...request, signal,
        content: messages => host.content?.captureReader(inputReferences(messages), options?.content, owner),
        telemetry: { pluginId: owner, purposeId: request.purpose ?? null, subjects: declared },
      }), { signal: request.signal, affectsHistory: false }).done;
    },
    list() { checkAvailable(); return host.languageModels.list(); },
  };
}
