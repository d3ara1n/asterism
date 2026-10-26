import { z } from "zod";
import { defineCall } from "@asterism/sdk/contracts";
import { builtin } from "./identity.ts";

/** 供模型使用的创建入口与资源类型的公开关联；不包含实例标题或执行权限。 */
export const ReadAgentCreations = defineCall(builtin.name("creations.read"), {
  scope: "plugin",
  input: z.strictObject({}),
  output: z.array(z.strictObject({ id: z.string(), resourceKind: z.string() })),
});
