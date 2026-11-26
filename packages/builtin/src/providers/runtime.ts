import { defineModule } from "@asterism-app/sdk/runtime";
import { languageModelProviderPresets } from "./presets.ts";
import { createZhipuUsage } from "./zhipu.ts";
import { createDeepSeekUsage } from "./deepseek.ts";
import { createNewApiUsage } from "./new-api.ts";
import { createSub2ApiUsage } from "./sub2api.ts";
import { createMoonshotUsage } from "./moonshot.ts";
import { createOpenRouterUsage } from "./openrouter.ts";
import { createOpenCodeUsage } from "./opencode.ts";
import { createCommandCodeUsage } from "./commandcode.ts";
import { createCharmHyperUsage } from "./charm-hyper.ts";
import { createKiloUsage } from "./kilo.ts";
import { createMiniMaxUsage } from "./minimax.ts";
import { createKimiUsage } from "./kimi.ts";
import { openaiHeaderUsage, anthropicHeaderUsage, xaiHeaderUsage } from "./headers.ts";

export const createBuiltinUsageProviders = (transport: typeof fetch = fetch) => [
  openaiHeaderUsage, anthropicHeaderUsage, xaiHeaderUsage,
  createZhipuUsage(transport), createZhipuUsage(transport, "zai-plan"),
  createDeepSeekUsage(transport), createMoonshotUsage("kimi-cn", transport), createMoonshotUsage("kimi", transport),
  createOpenRouterUsage(transport), createOpenCodeUsage(transport), createCommandCodeUsage(transport), createCharmHyperUsage(transport),
  createKiloUsage(transport), createMiniMaxUsage(transport), createNewApiUsage(transport),
  createSub2ApiUsage(transport),
  createKimiUsage("kimi-plan-cn", transport), createKimiUsage("kimi-plan", transport),
];

/** Presets and query providers belong to the built-in plugin; they use the same contribution registration and validation as third parties. */
export default defineModule(() => ({
  languageModelProviderPresets: languageModelProviderPresets.map(preset => ({ type: "add" as const, preset })),
  usageProviders: createBuiltinUsageProviders(),
}));
