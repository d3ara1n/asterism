import { z } from "zod";
import { jsonSchema, type Json } from "@asterism/sdk/contracts";
import type { ToolContract } from "@asterism/sdk/contracts";

export function schemaOf(schema: z.ZodType<Json>): Json {
  return jsonSchema.parse(z.toJSONSchema(schema));
}

/** 两层工具使用同一份定义投影；资源实现另行补充 target/result。 */
export function projectTool(tool: ToolContract) {
  return {
    name: tool.name,
    description: tool.description,
    guidelines: [...tool.guidelines],
    args: schemaOf(tool.argsSchema),
  };
}

/** provider 不认识 guidelines 字段，固定入口将指导一起投影为协议说明。 */
export function declareTool(tool: ToolContract) {
  const { name, description, guidelines, args } = projectTool(tool);
  return {
    name,
    description: guidelines.length ? `${description}\n\nGuidelines:\n${guidelines.map(line => `- ${line}`).join("\n")}` : description,
    parameters: args,
  };
}
