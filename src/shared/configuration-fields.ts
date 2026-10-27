import type { Json } from "@asterism/sdk/contracts";

export function objectValue(value: Json | undefined): Record<string, Json> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}
export type ConfigurationField =
  | { kind: "object"; properties: Record<string, Json>; required: readonly string[] }
  | { kind: "enum"; options: readonly Json[] }
  | { kind: "nullable-string"; schema: Json }
  | { kind: "string" | "number" | "integer" | "boolean" }
  | { kind: "json" };
/** JSON Schema selects controls only; original backend Zod schemas still validate constraints and refinements. */
export function configurationField(schema: Json | null): ConfigurationField {
  const shape = objectValue(schema);
  if (!shape || shape.$ref || shape.oneOf || shape.allOf || shape.if) return { kind: "json" };
  if (shape.anyOf) {
    if (Array.isArray(shape.anyOf) && shape.anyOf.length === 2) {
      const text = shape.anyOf.find(value => objectValue(value)?.type === "string");
      if (text && shape.anyOf.some(value => objectValue(value)?.type === "null")
        && configurationField(text).kind === "string") return { kind: "nullable-string", schema: text };
    }
    return { kind: "json" };
  }
  if (Object.hasOwn(shape, "const") && (shape.const === null || typeof shape.const !== "object"))
    return { kind: "enum", options: [shape.const!] };
  if (Array.isArray(shape.enum) && shape.enum.length && shape.enum.every(value => value === null || typeof value !== "object"))
    return { kind: "enum", options: shape.enum };
  const properties = objectValue(shape.properties);
  if (shape.type === "object" && properties && Object.keys(properties).length
    && (shape.additionalProperties === false || shape.additionalProperties === undefined)) return {
    kind: "object", properties,
    required: Array.isArray(shape.required) ? shape.required.filter((value): value is string => typeof value === "string") : [],
  };
  switch (shape.type) {
    case "string": case "number": case "integer": case "boolean": return { kind: shape.type };
    default: return { kind: "json" };
  }
}
export function configurationLabel(schema: Json | null, fallback: string): string {
  const title = objectValue(schema)?.title;
  return typeof title === "string" && title.trim() ? title : fallback;
}
export function configurationProperty(value: Json | undefined, name: string, next: Json | undefined): Json {
  const object = { ...objectValue(value) };
  if (next === undefined) delete object[name];
  else object[name] = next;
  return object;
}
