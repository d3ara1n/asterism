import * as runtime from "@atelier/builtin-api/runtime";
import { builtinPublicModules } from "./builtin-public.ts";

/** 后台公共实例单独绑定，前端组合入口不导入后台领域服务。 */
export const builtinRuntimePublicModules = { ...builtinPublicModules, "@atelier/builtin-api/runtime": runtime };
