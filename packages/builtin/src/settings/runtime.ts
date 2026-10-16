import { defineModule } from "@atelier/sdk/runtime";
import { BuiltinSettings } from "./contract.ts";

/** 声明 builtin 的用户配置，宿主据此生成插件设置页；读取发生在前端视图。 */
export default defineModule(plugin => { plugin.config(BuiltinSettings); return {}; });
