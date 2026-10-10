import { pluginNamespace } from "../shared/plugin.ts";

/** 内置功能插件；全部内置模块以它的命名空间声明贡献。 */
export const core = pluginNamespace("atelier.core");
export const coreVersion = "0.1.0";
