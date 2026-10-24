import { z } from "zod";

/** 可传输的原始错误资料；响应正文和附加数据保持文本，避免被当成业务引用扫描。 */
export type ErrorDetails = {
  name?: string;
  message: string;
  code?: string | number;
  statusCode?: number;
  /** 实际接收的 HTTP 状态；statusCode 保留错误对象的原值，可能由 SDK 推导。 */
  httpStatus?: number;
  responseBody?: string;
  /** SDK 交付首个模型块前失败时，传输层实际收到的流式响应片段。 */
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

/** 提取错误本身与响应资料；请求正文、请求头和凭据不属于错误详情。 */
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
