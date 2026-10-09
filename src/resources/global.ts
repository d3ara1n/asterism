import { z } from "zod";
import { jsonSchema, type Json } from "../shared/model.ts";
import type { RuntimeTool } from "../execution/tools.ts";
import type { FoldedObject } from "../session/fold.ts";
import { schemaOf, toolSummary, type ResourceType } from "./index.ts";

/** 顶层只暴露三个全局工具；资源工具是二级动态工具，不进入 tools 列表，链接变化不改变请求前缀。 */
export function globalTools(types: ResourceType[], linked: () => FoldedObject[]): RuntimeTool[] {
  const typeOf = (r: FoldedObject) => types.find(t => t.kind === r.kind);
  const find = (id: string) => linked().find(r => r.id === id);
  const listSchema = z.strictObject({}) as z.ZodType<Json>;
  const inspectSchema = z.strictObject({ resource_id: z.string().min(1) }) as z.ZodType<Json>;
  const callSchema = z.strictObject({ resource_id: z.string().min(1), tool: z.string().min(1), args: jsonSchema.default({}) }) as z.ZodType<Json>;
  const unlinked = { kind: "rejected" as const, error: { code: "access_denied", message: "The resource is not linked to this agent." } };
  return [
    { name: "resource_list", description: "List resources currently linked to you.", parameters: schemaOf(listSchema), schema: listSchema,
      permission: "read", effect: "read", execution: "parallel", global: true,
      async execute() {
        const items = linked().map(r => ({ resource_id: r.id, type: r.kind, title: r.title }));
        return { kind: "succeeded", model: { resources: items }, data: { resources: items } };
      } },
    { name: "resource_inspect", description: "Inspect a linked resource's live state and its available tools with parameter schemas.",
      parameters: schemaOf(inspectSchema), schema: inspectSchema, permission: "read", effect: "read", execution: "parallel", global: true,
      async execute(args) {
        const { resource_id } = z.object({ resource_id: z.string() }).parse(args);
        const r = find(resource_id); const t = r && typeOf(r);
        if (!r || !t) return unlinked;
        const state = await t.inspect(r);
        const value = { resource_id, state, tools: toolSummary(t) };
        return { kind: "succeeded", model: value, data: value };
      } },
    { name: "resource_call", description: "Call a tool provided by a linked resource. Use resource_inspect to see each tool's parameters.",
      parameters: schemaOf(callSchema), schema: callSchema, permission: "read", effect: "write", execution: "sequential", global: true,
      async execute(args, signal) {
        const { resource_id, tool, args: inner } = z.object({ resource_id: z.string(), tool: z.string(), args: jsonSchema }).parse(args);
        const r = find(resource_id); const t = r && typeOf(r);
        if (!r || !t) return unlinked;
        const impl = t.tools.find(x => x.name === tool);
        if (!impl) return { kind: "rejected", error: { code: "tool_unavailable", message: `This resource has no tool named ${tool}. Use resource_inspect to list tools.` } };
        const parsed = impl.schema.safeParse(inner ?? {});
        if (!parsed.success) return { kind: "rejected", error: { code: "invalid_arguments",
          message: `Arguments do not match the schema: ${JSON.stringify(schemaOf(impl.schema))}` } };
        return impl.execute(r, parsed.data, signal);
      } },
  ];
}
