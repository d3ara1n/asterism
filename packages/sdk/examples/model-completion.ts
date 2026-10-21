import { z } from "zod";
import { pluginNamespace, present, completionData, type ModelCompletion, type ModelRunRequest } from "../src/contracts.ts";

const ns = pluginNamespace("example.agent");
const RequestTools = ns.data("request-tools", z.object({ names: z.array(z.string()) }));

/** 生产方声明领域资料，公共模型服务只携带具型封装。 */
export const completionExtensions: NonNullable<ModelRunRequest["completionExtensions"]> = context => [
  present(RequestTools, { names: context.tools.map(tool => tool.name) }),
];

/** 消费方显式导入同一个契约；缺失或未知扩展不影响公共用量。 */
export function inspectCompletion(completion: ModelCompletion) {
  return { usage: completion.usage, tools: completionData(completion, RequestTools)?.names ?? null };
}
