import type { z } from "zod";
import { WebError } from "@asterism-app/sdk/runtime";

/** Upstream response validation failures are protocol errors, distinct from retrieval failures. */
export function parseWebResponse<T>(provider: string, schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const error = new WebError("protocol", `${provider} returned an invalid response: ${parsed.error.message}`);
  error.cause = parsed.error;
  throw error;
}
