import { z } from "zod";
import { jsonSchema, type Json } from "@asterism-app/sdk/contracts";
import type { ToolContract } from "@asterism-app/sdk/contracts";

/** Model-facing schemas are embedded in larger payloads, so the root `$schema` dialect URL is dropped from each one. */
export function schemaOf(schema: z.ZodType<Json>, io: "input" | "output" = "output"): Json {
  const { $schema: _dialect, ...projected } = z.toJSONSchema(schema, { io });
  return jsonSchema.parse(projected);
}

/** Protocol declarations carry no references or definition tables; recursive or named schemas fail projection instead of losing constraints. */
function toolParameters(schema: z.ZodType<Json>, name: string): Json {
  let projected: z.core.JSONSchema.BaseSchema;
  try {
    projected = z.toJSONSchema(schema, { cycles: "throw", reused: "inline" });
  } catch (error) {
    throw new Error(`Top-level tool ${name} has a parameter schema that cannot be projected inline`, { cause: error });
  }
  const { $schema: _dialect, $defs, ...parameters } = projected;
  if ($defs) throw new Error(`Top-level tool ${name} has named parameter schemas: ${Object.keys($defs).join(", ")}`);
  return jsonSchema.parse(parameters);
}

/** Resource inspection retains complete argument schemas and adds implementation-specific targets separately. */
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
  const { name, description, guidelines } = tool;
  return {
    name,
    description: guidelines.length ? `${description}\n\nGuidelines:\n${guidelines.map(line => `- ${line}`).join("\n")}` : description,
    parameters: toolParameters(tool.argsSchema, name),
  };
}
