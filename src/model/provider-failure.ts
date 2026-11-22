import { APICallError, StreamProviderError, JSONParseError, TypeValidationError, InvalidResponseDataError } from "ai";
import { describeError, errorMessage } from "@asterism-app/sdk/contracts";
import { ZodError } from "zod";
import { ModelFailure } from "./contract.ts";

const retryableStatuses = new Set([408, 429, 500, 502, 503, 504, 529]);
const disconnectCodes = new Set(["UND_ERR_SOCKET", "ECONNRESET"]);

interface FailureEvidence {
  upstream?: boolean;
  httpStatus?: number;
  readFailure?: { error: unknown };
  allowReadRetry?: boolean;
}

function* causes(error: unknown): Iterable<unknown> {
  const seen = new Set<unknown>();
  while (!seen.has(error)) {
    seen.add(error);
    yield error;
    if (!error || typeof error !== "object" || !("cause" in error)) return;
    error = error.cause;
  }
}

function isDisconnect(error: unknown): boolean {
  for (const cause of causes(error)) {
    if (cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string" && disconnectCodes.has(cause.code)) return true;
  }
  return false;
}

/** Failure provenance and retry eligibility are independent; the SDK can wrap body read errors in an HTTP 200 error. */
export function providerFailure(error: unknown, { upstream, httpStatus, readFailure, allowReadRetry }: FailureEvidence = {}): ModelFailure {
  if (error instanceof ModelFailure) return error;
  const parsing = error instanceof SyntaxError || error instanceof ZodError
    || JSONParseError.isInstance(error) || TypeValidationError.isInstance(error) || InvalidResponseDataError.isInstance(error);
  const providerError = APICallError.isInstance(error) || StreamProviderError.isInstance(error);
  const httpRejected = httpStatus !== undefined && httpStatus >= 400;
  const fromRead = readFailure !== undefined && Array.from(causes(error)).includes(readFailure.error);
  const remote = upstream || providerError || httpRejected || fromRead || (httpStatus !== undefined && parsing);
  // An HTTP rejection takes precedence over an SDK-inferred status. Only actual body read failures can qualify as disconnects.
  const status = httpRejected ? httpStatus : providerError ? error.statusCode : undefined;
  const earlyDisconnect = allowReadRetry && fromRead && !parsing && httpStatus !== undefined && httpStatus >= 200 && httpStatus < 300
    && isDisconnect(readFailure.error);
  const retryable = (status !== undefined && retryableStatuses.has(status)) || earlyDisconnect === true;
  // SDK parsing/validation messages embed received values and issue trees; retain them only in details.
  const message = parsing ? "Model response parsing failed."
    : errorMessage(error, remote ? "Provider request failed." : "Model processing failed.");
  return new ModelFailure(parsing ? "response_parsing" : remote ? "provider_error" : "processing_error",
    message, describeError(error), remote ? "model" : "software", retryable);
}
