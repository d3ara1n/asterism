import { z } from "zod";
import { jsonSchema, type Json } from "./json.ts";
import { validationMessage } from "./tool-validation.ts";

/** Data producers supply decoded values; storage and transport retain the JSON encoding. */
export function encodeJson<T extends Json>(schema: z.ZodType<T>, value: T, subject: string): Json {
  try { return jsonSchema.parse(z.encode(schema, value)); }
  catch (error) {
    if (!(error instanceof z.ZodError) && !(error instanceof z.core.$ZodEncodeError)) throw error;
    const detail = error instanceof z.ZodError ? validationMessage(error, subject)
      : `${subject}: ${error.message}`;
    throw new Error(`Cannot encode data: ${detail}`, { cause: error });
  }
}
