import { z } from "zod";
import { defineTool } from "../shared/module-contract.ts";

/** 内置共享工具；模块也可声明独特工具或引用其他模块导出的定义。 */
export const List = defineTool({
  name: "list",
  description: "List the entries in a container to discover its contents and entry types.",
  guidelines: [
    "Choose a container using the resource implementation's target schema; use null only when the schema supports it.",
    "Pass args as an empty object. Listing discovers entries; it does not read their contents or search recursively.",
    "Check the result's truncation indicator before treating the listing as complete.",
  ],
  argsSchema: z.strictObject({}).describe("Listing takes no operation parameters; pass an empty object."),
});
