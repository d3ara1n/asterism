import { modelProviderPresetSchema, type ModelProviderPreset } from "@asterism-app/sdk/contracts";
import { modelProviderInputSchema, type ModelProviderInput } from "./configuration.ts";
export type { ModelProviderPreset } from "@asterism-app/sdk/contracts";
export type ModelProviderDraft = Omit<ModelProviderInput, "enabled">;

/** Copy connection defaults and presentation independently of the catalog entry. */
export function modelProviderPresetDraft(preset: ModelProviderPreset, occupiedIds: readonly string[] = []): ModelProviderDraft {
  let id = preset.id;
  for (let suffix = 2; occupiedIds.includes(id); suffix++) id = `${preset.id}-${suffix}`;
  const { enabled: _, ...draft } = modelProviderInputSchema.parse({
    id, name: preset.name, ...structuredClone(preset.connection), enabled: true,
    ...(preset.iconId !== undefined && { iconId: preset.iconId }),
  });
  return draft;
}

/** All plugin presets pass the same connection validation, rejecting unimplemented compatibility entries. */
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
