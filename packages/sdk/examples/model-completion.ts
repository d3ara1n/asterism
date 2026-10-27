import { z } from "zod";
import { pluginNamespace, present, completionData, type ModelCompletion, type ModelRunRequest } from "@asterism-app/sdk/contracts";

const ns = pluginNamespace("example.agent");
const RequestTools = ns.data("request-tools", z.object({ names: z.array(z.string()) }));

/** Producers declare domain data; the public model service carries only typed envelopes. */
export const completionExtensions: NonNullable<ModelRunRequest["completionExtensions"]> = context => [
  present(RequestTools, { names: context.tools.map(tool => tool.name) }),
];

/** Consumers explicitly import the same contract; missing or unknown extensions do not affect public usage data. */
export function inspectCompletion(completion: ModelCompletion) {
  return { usage: completion.usage, tools: completionData(completion, RequestTools)?.names ?? null };
}
