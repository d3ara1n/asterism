import { wrapLanguageModel, type LanguageModelMiddleware } from "ai";
import type { ThinkingLevel } from "@asterism-app/sdk/contracts";
import { ModelFailure } from "./contract.ts";
import type { ThinkingMappings } from "./compatibility.ts";

export type LanguageModelV4 = Parameters<NonNullable<LanguageModelMiddleware["wrapStream"]>>[0]["model"];
type CallOptions = Parameters<NonNullable<LanguageModelMiddleware["wrapStream"]>>[0]["params"];
export type Body = Record<string, unknown>;
/** Rewrites one serialized request body for an explicit standard level; protocols own field names and value mappings. */
export type ThinkingEncoder = (body: Body, level: ThinkingLevel, maxOutputTokens: number | undefined) => void;

export function requestObject(value: unknown): Body {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ModelFailure("protocol_encoding", "The thinking encoder received an invalid request object.");
  return value as Body;
}

/** Modify only the named effort field; retain summaries, structured output, and other parameters in the same object. */
export function setEffort(body: Body, field: string, effort: string | null) {
  const values = body[field] === undefined ? {} : { ...requestObject(body[field]) };
  if (effort === null) delete values.effort;
  else values.effort = effort;
  if (Object.keys(values).length) body[field] = values;
  else delete body[field];
}

/** Explicit mappings win; off maps to "none" and other levels pass through unchanged unless the protocol renames them. */
export function mappedEffort(level: ThinkingLevel, mappings: ThinkingMappings, rename: Partial<Record<ThinkingLevel, string>> = {}): string | null {
  const custom = mappings.levels[level];
  if (custom !== undefined) return custom;
  return level === "off" ? "none" : rename[level] ?? level;
}

/**
 * Applies the protocol's encoder at the final serialized-body boundary for requests with an explicit level.
 * Each call independently captures options and transport without shared mutable state linking concurrent requests.
 */
export function withThinkingEncoding(createModel: (transport: typeof fetch) => LanguageModelV4, transport: typeof fetch, encode: ThinkingEncoder) {
  const project = (params: CallOptions) => {
    // Probes, disabled reasoning, and unset levels use SDK defaults without consuming level or budget mappings.
    if (params.reasoning === undefined || params.reasoning === "provider-default") return null;
    const level: ThinkingLevel = params.reasoning === "none" ? "off" : params.reasoning;
    const wireFetch: typeof fetch = (url, init) => {
      if (typeof init?.body !== "string")
        throw new ModelFailure("protocol_encoding", "The thinking encoder requires a serialized request body.");
      const body = requestObject(JSON.parse(init.body));
      encode(body, level, params.maxOutputTokens);
      return transport(url, { ...init, body: JSON.stringify(body) });
    };
    return createModel(wireFetch);
  };
  return wrapLanguageModel({ model: createModel(transport), middleware: {
    specificationVersion: "v4",
    wrapStream: ({ params, doStream }) => {
      const target = project(params);
      return target ? target.doStream(params) : doStream();
    },
    wrapGenerate: ({ params, doGenerate }) => {
      const target = project(params);
      return target ? target.doGenerate(params) : doGenerate();
    },
  } });
}
