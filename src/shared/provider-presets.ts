import { providerPresetSchema, type ProviderPreset } from "@atelier/sdk/contracts";
import { providerInputSchema, type ProviderInput } from "./configuration.ts";
export type { ProviderPreset } from "@atelier/sdk/contracts";
export type ProviderDraft = Omit<ProviderInput, "enabled">;

/** 深复制配置与编辑规则；目录身份和资料不进入已保存连接。 */
export function providerPresetDraft(preset: ProviderPreset, occupiedIds: readonly string[] = []): ProviderDraft {
  let id = preset.id;
  for (let suffix = 2; occupiedIds.includes(id); suffix++) id = `${preset.id}-${suffix}`;
  const { enabled: _, ...draft } = providerInputSchema.parse({ id, name: preset.name, ...structuredClone(preset.connection), enabled: true });
  return draft;
}

/** 所有插件预设经过同一连接校验，拒绝未实现的兼容条目。 */
export function defineProviderPresets(presets: readonly ProviderPreset[]) {
  const ids = new Set<string>();
  const parsed = presets.map(preset => providerPresetSchema.parse(preset));
  for (const preset of parsed) {
    if (ids.has(preset.id)) throw new Error(`Duplicate provider preset: ${preset.id}`);
    ids.add(preset.id);
    providerPresetDraft(preset);
  }
  return parsed;
}
