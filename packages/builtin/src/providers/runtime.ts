import { defineModule } from "@asterism-app/sdk/runtime";
import { modelProviderPresets } from "./presets.ts";
import { createZhipuUsage } from "./zhipu.ts";
import { createDeepSeekUsage } from "./deepseek.ts";
import { createMoonshotUsage } from "./moonshot.ts";
import { createOpenRouterUsage } from "./openrouter.ts";
import { createOpenCodeUsage } from "./opencode.ts";
import { createKimiUsage } from "./kimi.ts";
import { openaiHeaderUsage, anthropicHeaderUsage, xaiHeaderUsage } from "./headers.ts";

export const createBuiltinUsageProviders = (transport: typeof fetch = fetch) => [
  openaiHeaderUsage, anthropicHeaderUsage, xaiHeaderUsage,
  createZhipuUsage(transport), createZhipuUsage(transport, "zai-plan"),
  createDeepSeekUsage(transport), createMoonshotUsage("kimi-cn", transport), createMoonshotUsage("kimi", transport),
  createOpenRouterUsage(transport), createOpenCodeUsage(transport),
  createKimiUsage("kimi-plan-cn", transport), createKimiUsage("kimi-plan", transport),
];

/** Presets and query providers belong to the built-in plugin; they use the same contribution registration and validation as third parties. */
export default defineModule(() => ({
  modelProviderPresets: modelProviderPresets.map(preset => ({ type: "add" as const, preset })),
  usageProviders: createBuiltinUsageProviders(),
}));
