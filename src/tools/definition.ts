import { z } from "zod";
import { jsonSchema, type Json } from "@asterism-app/sdk/contracts";
import type { ToolContract } from "@asterism-app/sdk/contracts";

export function schemaOf(schema: z.ZodType<Json>): Json {
  return jsonSchema.parse(z.toJSONSchema(schema));
}

/** Both tool layers share definition projection; resource implementations add target/result separately. */
export function projectTool(tool: ToolContract) {
  return {
    name: tool.name,
    description: tool.description,
    guidelines: [...tool.guidelines],
    args: schemaOf(tool.argsSchema),
  };
}

/** Providers do not recognize guidelines; fixed entries project guidance into protocol descriptions. */
export function declareTool(tool: ToolContract) {
  const { name, description, guidelines, args } = projectTool(tool);
  return {
    name,
    description: guidelines.length ? `${description}\n\nGuidelines:\n${guidelines.map(line => `- ${line}`).join("\n")}` : description,
    parameters: args,
  };
}
