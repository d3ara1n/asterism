import { z } from "zod";

/** Transferable raw error data; response bodies and additional data remain text to avoid being scanned as business references. */
export type ErrorDetails = {
  name?: string;
  message: string;
  code?: string | number;
  statusCode?: number;
  /** The actual HTTP status received; statusCode preserves the error object's original value, which may be inferred by the SDK. */
  httpStatus?: number;
  responseBody?: string;
  /** The streaming response fragment actually received by the transport when the SDK fails before delivering the first model block. */
  rawResponse?: string;
  rawEvent?: string;
  responseHeaders?: Record<string, string>;
  data?: string;
  stack?: string;
  causes?: ErrorDetails[];
};
export const errorDetailsSchema: z.ZodType<ErrorDetails> = z.strictObject({
  name: z.string().optional(), message: z.string(), code: z.union([z.string(), z.number()]).optional(),
  statusCode: z.number().optional(), httpStatus: z.number().optional(), responseBody: z.string().optional(),
  rawResponse: z.string().optional(), rawEvent: z.string().optional(),
  responseHeaders: z.record(z.string(), z.string()).optional(), data: z.string().optional(),
  stack: z.string().optional(), causes: z.lazy(() => errorDetailsSchema.array()).optional(),
});

/** Extract the error itself and response data; request bodies, request headers, and credentials are not error details. */
export function describeError(error: unknown): ErrorDetails {
  const seen = new Set<object>();
  const encode = (value: unknown): string => {
    if (typeof value === "string") return value;
    const ancestors: object[] = [];
    return JSON.stringify(value, function (_key, item: unknown) {
      if (typeof item === "bigint") return String(item);
      if (item && typeof item === "object") {
        while (ancestors.length && ancestors.at(-1) !== this) ancestors.pop();
        if (ancestors.includes(item)) return "[Circular]";
        ancestors.push(item);
      }
      return item;
    }) ?? String(value);
  };
  const visit = (value: unknown): ErrorDetails => {
    if (!value || typeof value !== "object") return { message: typeof value === "string" ? value : encode(value) };
    if (seen.has(value)) return { message: "[Circular error cause]" };
    seen.add(value);
    const record = value as Record<string, unknown>;
    const attached = errorDetailsSchema.safeParse(record.details);
    if (attached.success) return attached.data;
    const { requestBodyValues: _values, requestBody: _body, requestHeaders: _headers, responseHeaders: _responseHeaders, ...raw } = record;
    const details: ErrorDetails = {
      message: typeof record.message === "string" ? record.message : encode(raw),
    };
    if (typeof record.name === "string") details.name = record.name;
    if (typeof record.code === "string" || typeof record.code === "number") details.code = record.code;
    if (typeof record.stack === "string") details.stack = record.stack;
    if (typeof record.statusCode === "number") details.statusCode = record.statusCode;
    if (typeof record.httpStatus === "number") details.httpStatus = record.httpStatus;
    if (typeof record.responseBody === "string") details.responseBody = record.responseBody;
    if (typeof record.rawResponse === "string") details.rawResponse = record.rawResponse;
    if (typeof record.rawEvent === "string") details.rawEvent = record.rawEvent;
    if (record.responseHeaders && typeof record.responseHeaders === "object") {
      details.responseHeaders = Object.fromEntries(Object.entries(record.responseHeaders)
        .filter((entry): entry is [string, string] => typeof entry[1] === "string"
          && !/^(authorization|proxy-authorization|cookie|set-cookie|x-api-key)$/iu.test(entry[0])));
    }
    if (record.data !== undefined) details.data = encode(record.data);
    else if (!(value instanceof Error)) details.data = encode(raw);
    const causes = [
      ...(record.cause !== undefined ? [record.cause] : []),
      ...(Array.isArray(record.errors) ? record.errors : []),
    ];
    if (causes.length) details.causes = causes.map(visit);
    return details;
  };
  return visit(error);
}
