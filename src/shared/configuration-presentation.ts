import {
  configurationPresentationSchema, type ConfigurationPresentation,
  type ConfigurationFieldPresentation, type Json,
} from "@atelier/sdk/contracts";

import { configurationField } from "./configuration-fields.ts";

export function pointerChild(parent: string, name: string): string {
  return `${parent}/${name.replace(/~/gu, "~0").replace(/\//gu, "~1")}`;
}

/** 映射只消费表单可投影的固定对象字段，不改变配置值校验。 */
export function projectConfigurationPresentation(
  schema: Json | null,
  input: ConfigurationPresentation | undefined,
  diagnose: (message: string) => void,
): ConfigurationPresentation | undefined {
  if (!input) return undefined;
  const parsed = configurationPresentationSchema.safeParse(input);
  if (!parsed.success) {
    diagnose("Invalid configuration presentation.");
    return undefined;
  }
  const reachable = new Map<string, ReturnType<typeof configurationField>>();
  const visit = (node: Json | null, path: string, depth: number, required = true) => {
    const field = depth < 6 ? configurationField(node) : { kind: "json" as const };
    reachable.set(path, field);
    if (field.kind === "object" && required) {
      for (const [name, child] of Object.entries(field.properties)) {
        visit(child, pointerChild(path, name), depth + 1, field.required.includes(name));
      }
    }
  };
  visit(schema, "", 0);
  const fields: Record<string, ConfigurationFieldPresentation> = {};
  for (const [path, presentation] of Object.entries(parsed.data.fields)) {
    const field = reachable.get(path);
    if (!field) {
      diagnose(`Unreachable configuration presentation path: ${path}.`);
      continue;
    }
    const labels = presentation.enumLabels?.filter((entry, index, list) => {
      if (list.slice(0, index).some(previous => previous.value === entry.value)) {
        diagnose(`Duplicate enum presentation: ${path}.`);
        return false;
      }
      if (field.kind !== "enum" || !field.options.some(option => option === entry.value)) {
        diagnose(`Unknown enum presentation: ${path}.`);
        return false;
      }
      return true;
    });
    fields[path] = { ...presentation, ...(labels ? { enumLabels: labels } : {}) };
  }
  return { fields };
}
