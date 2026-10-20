import { defineModule } from "@atelier/sdk/runtime";
import { providerPresets } from "./presets.ts";
import { createZhipuUsage } from "./zhipu.ts";

/** 预设和查询提供方属于内置插件；与第三方经过同一贡献登记和校验。 */
export default defineModule(() => ({
  providerPresets: providerPresets.map(preset => ({ type: "add" as const, preset })),
  usageProviders: [createZhipuUsage()],
}));
