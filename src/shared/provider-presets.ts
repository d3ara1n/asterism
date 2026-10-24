import { modelProviderPresetSchema, type ModelProviderPreset } from "@atelier/sdk/contracts";
import { modelProviderInputSchema, type ModelProviderInput } from "./configuration.ts";
export type { ModelProviderPreset } from "@atelier/sdk/contracts";
export type ModelProviderDraft = Omit<ModelProviderInput, "enabled">;

/** 深复制配置与编辑规则；目录身份和资料不进入已保存连接。 */
export function modelProviderPresetDraft(preset: ModelProviderPreset, occupiedIds: readonly string[] = []): ModelProviderDraft {
  let id = preset.id;
  for (let suffix = 2; occupiedIds.includes(id); suffix++) id = `${preset.id}-${suffix}`;
  const { enabled: _, ...draft } = modelProviderInputSchema.parse({ id, name: preset.name, ...structuredClone(preset.connection), enabled: true });
  return draft;
}

/** 所有插件预设经过同一连接校验，拒绝未实现的兼容条目。 */
export function defineProviderPresets(presets: readonly ModelProviderPreset[]) {
  const ids = new Set<string>();
  const parsed = presets.map(preset => modelProviderPresetSchema.parse(preset));
  for (const preset of parsed) {
    if (ids.has(preset.id)) throw new Error(`Duplicate provider preset: ${preset.id}`);
    ids.add(preset.id);
    modelProviderPresetDraft(preset);
  }
  return parsed;
}
