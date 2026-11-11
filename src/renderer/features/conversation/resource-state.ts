import type { Json } from "@asterism-app/sdk/contracts";

/** Display classes for resource-provided state. The host does not interpret resource-specific fields; it classifies JSON values only by shape. */
export type StateValue =
  | { kind: "empty" }
  | { kind: "flag"; value: boolean }
  | { kind: "number"; value: number }
  /** Single-line text without spaces that contains path, URL, or identifier punctuation. */
  | { kind: "token"; value: string }
  | { kind: "text"; value: string }
  /** Multi-line or long text that needs the full row width. */
  | { kind: "prose"; value: string }
  | { kind: "list"; values: string[] }
  | { kind: "group"; fields: StateField[] }
  | { kind: "items"; items: StateValue[] };
export interface StateField { key: string; label: string; value: StateValue }

const PROSE_LENGTH = 60;

function isScalar(value: Json): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

export function stateValue(value: Json): StateValue {
  if (value === null || value === "") return { kind: "empty" };
  if (typeof value === "boolean") return { kind: "flag", value };
  if (typeof value === "number") return { kind: "number", value };
  if (typeof value === "string") {
    if (value.includes("\n") || value.length > PROSE_LENGTH) return { kind: "prose", value };
    return /^\S+$/.test(value) && /[/\\:.@]/.test(value) ? { kind: "token", value } : { kind: "text", value };
  }
  if (Array.isArray(value)) {
    if (!value.length) return { kind: "empty" };
    return value.every(isScalar) ? { kind: "list", values: value.map(String) } : { kind: "items", items: value.map(stateValue) };
  }
  const fields = stateFields(value);
  return fields.length ? { kind: "group", fields } : { kind: "empty" };
}

/** snake_case, kebab-case, and camelCase keys read as words; the raw key remains available to the view. */
export function fieldLabel(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim().toLowerCase();
  return words ? words[0]!.toUpperCase() + words.slice(1) : key;
}

function stateFields(value: { [key: string]: Json }): StateField[] {
  return Object.entries(value).map(([key, field]) => ({ key, label: fieldLabel(key), value: stateValue(field) }));
}

/** Top-level fields that repeat the call's resource title or kind are already shown by the header. */
export function resourceStateFields(state: Json, identity?: { title: string; kind: string }): StateField[] {
  if (state === null || typeof state !== "object" || Array.isArray(state)) {
    const value = stateValue(state);
    return value.kind === "empty" ? [] : [{ key: "", label: "", value }];
  }
  const entries = identity ? Object.fromEntries(Object.entries(state)
    .filter(([, field]) => field !== identity.title && field !== identity.kind)) : state;
  return stateFields(entries);
}
