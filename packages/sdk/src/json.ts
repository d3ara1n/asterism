import { z } from "zod";

export type JsonObject = { [key: string]: Json };
export type Json = null | boolean | number | string | Json[] | JsonObject;

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isJson(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJson);
  return typeof value === "object" && isPlainObject(value) && Object.values(value).every(isJson);
}

/** Any JSON value. A non-recursive check keeps the JSON Schema projection the open schema `{}`. */
export const jsonSchema = z.unknown().refine(isJson, "Expected a JSON value") as z.ZodType<Json>;
