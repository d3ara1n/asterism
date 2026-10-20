import { defineModule } from "@atelier/sdk/runtime";
import { providerPresets } from "./presets.ts";
import { createZhipuUsage } from "./zhipu.ts";
import { createDeepSeekUsage } from "./deepseek.ts";
import { createMoonshotUsage } from "./moonshot.ts";
import { createOpenRouterUsage } from "./openrouter.ts";
import { createOpenCodeUsage } from "./opencode.ts";
import { createKimiUsage } from "./kimi.ts";

export const createBuiltinUsageProviders = (transport: typeof fetch = fetch) => [
  createZhipuUsage(transport), createZhipuUsage(transport, "zai-plan"),
  createDeepSeekUsage(transport), createMoonshotUsage("kimi-cn", transport), createMoonshotUsage("kimi", transport),
  createOpenRouterUsage(transport), createOpenCodeUsage(transport),
  createKimiUsage("kimi-plan-cn", transport), createKimiUsage("kimi-plan", transport),
];

/** 预设和查询提供方属于内置插件；与第三方经过同一贡献登记和校验。 */
export default defineModule(() => ({
  providerPresets: providerPresets.map(preset => ({ type: "add" as const, preset })),
  usageProviders: createBuiltinUsageProviders(),
}));
