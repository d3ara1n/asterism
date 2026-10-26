import { defineModule, implementResource, implementCreation, implementTool } from "@asterism/sdk/runtime";
import { CreateManual, Manual, ManualView, ManualList, ManualRead, ManualFind, ManualGrep } from "./contract.ts";
import { manualCard } from "../shared/card-appearance.ts";
import { listFiles, readFileContent } from "../filesystem/read.ts";
import { findFiles, grepFiles } from "../filesystem/search.ts";
import { findToModel, grepToModel } from "../filesystem/search-presentation.ts";
import { readToModel } from "../shared/text.ts";

export function createManualModule(root: string, applicationName: string) {
  return defineModule(() => ({
    resources: [implementResource(Manual, ManualView, {
      card: manualCard,
      creation: implementCreation(CreateManual, { create: () => ({ title: `${applicationName} manual`, data: {} }) }),
      project: () => ({}),
      inspect: async () => ({
        description: `The manual bundled with this version of ${applicationName}: software use and plugin development.`,
      }),
    })],
    tools: [
      implementTool(ManualList, { call: (_data, target, _args, { signal }) => listFiles(root, target, signal) }),
      implementTool(ManualRead, {
        call: (_data, target, args, { signal }) => readFileContent(root, target, args, signal),
        toModel: data => `${data.path}\n${readToModel(data)}`,
      }),
      implementTool(ManualFind, {
        call: (_data, target, args, { signal }) => findFiles(root, target, args, signal), toModel: findToModel,
      }),
      implementTool(ManualGrep, {
        call: (_data, target, args, { signal }) => grepFiles(root, target, args, signal), toModel: grepToModel,
      }),
    ],
  }));
}
