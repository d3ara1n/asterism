import { expect, it } from "vitest";
import { describeError } from "./error-details.ts";

// SDK 异常会把请求参数与响应放在同一个对象；保存诊断时只选择错误与响应资料。
it("错误详情保留原始响应和原因链，排除请求字段与凭据响应头", () => {
  const cause = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
  const error = Object.assign(new Error("upstream failure", { cause }), {
    statusCode: 502, responseBody: "<html>Bad Gateway</html>",
    responseHeaders: { "x-request-id": "req-1", "set-cookie": "private-cookie", Authorization: "private-token" },
    requestBodyValues: { messages: ["private-prompt"] }, requestHeaders: { authorization: "private-key" },
  });
  const details = describeError(error);
  expect(details).toMatchObject({
    message: "upstream failure", statusCode: 502, responseBody: "<html>Bad Gateway</html>",
    responseHeaders: { "x-request-id": "req-1" },
    causes: [{ message: "connect ECONNREFUSED", code: "ECONNREFUSED" }],
  });
  expect(JSON.stringify(details)).not.toContain("private-");
  expect(JSON.stringify(describeError({ ...error, message: error.message }))).not.toContain("private-");
});

// 流式错误可能是普通 JSON；保留服务端的未知字段，不只抽取一段 message。
it("普通服务端错误数据和已有诊断通过后续包装保持原文", () => {
  const original = { type: "error", error: { code: "overloaded", message: "Try later", retry_after: 5 } };
  const details = describeError(original);
  expect(details.data).toBe(JSON.stringify(original));
  expect(describeError(Object.assign(new Error("wrapper"), { details }))).toEqual(details);
});
