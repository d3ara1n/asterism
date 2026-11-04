import { z } from "zod";
import { jsonSchema, type Json } from "@asterism-app/sdk/contracts";
import type { ToolContract } from "@asterism-app/sdk/contracts";

/** Model-facing schemas are embedded in larger payloads, so the root `$schema` dialect URL is dropped from each one. */
export function schemaOf(schema: z.ZodType<Json>): Json {
  const { $schema: _dialect, ...projected } = z.toJSONSchema(schema);
  return jsonSchema.parse(projected);
}

/** Both tool layers share definition projection; the model layer adds availability and resource implementations add target separately. */
export function projectTool(tool: ToolContract) {
  return {
    name: tool.name,
    description: tool.description,
    guidelines: [...tool.guidelines],
    args: schemaOf(tool.argsSchema),
    requiresInteraction: tool.requiresInteraction === true,
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
