import { z } from "zod";
import { defineTool } from "../shared/module-contract.ts";

/** 共享工具只定义身份与 args；后端分别声明 target、result 并注册 handler。 */
export const Read = defineTool("read", z.strictObject({}));
export const List = defineTool("list", z.strictObject({}));
