import { defineModule, implementResource, implementCreation, implementTool } from "@asterism/sdk/runtime";
import { CreateManual, Manual, ManualView, ManualList, ManualRead, ManualFind, ManualGrep } from "./contract.ts";
import { manualCard } from "../shared/card-appearance.ts";
import type { ManualSource } from "@asterism/builtin-api/runtime";
import { listManual, readManual, findManual, grepManual } from "./files.ts";
import { findToModel, grepToModel } from "../filesystem/search-presentation.ts";
import { readToModel } from "../shared/text.ts";

export function createManualModule(sources: () => readonly ManualSource[], applicationName: string) {
  return defineModule(() => ({
    resources: [implementResource(Manual, ManualView, {
      card: manualCard,
      template: { current: [] },
      creation: implementCreation(CreateManual, { create: () => ({ title: `${applicationName} manual`, data: {} }) }),
      project: () => ({}),
      inspect: async () => ({
        description: `The ${applicationName} manual: application guides, public package examples, and documentation exposed by loaded plugins. Paths identify sources; root searches cover all sources.`,
        sources: sources().map(source => source.path),
      }),
    })],
    tools: [
      implementTool(ManualList, { call: (_data, target, _args, { signal }) => listManual(sources(), target, signal) }),
      implementTool(ManualRead, {
        call: (_data, target, args, { signal }) => readManual(sources(), target, args, signal),
        toModel: data => `${data.path}\n${readToModel(data)}`,
      }),
      implementTool(ManualFind, {
        call: (_data, target, args, { signal }) => findManual(sources(), target, args, signal), toModel: findToModel,
      }),
      implementTool(ManualGrep, {
        call: (_data, target, args, { signal }) => grepManual(sources(), target, args, signal), toModel: grepToModel,
      }),
    ],
  }));
}
