import { describe, expect, it } from "vitest";
import { filesystemFailure } from "./errors.ts";

describe("文件系统错误反馈", () => {
  // 权限与设备错误直接验证 errno 映射，避免依赖测试进程的系统权限。
  it.each(["EACCES", "EPERM"])("权限错误 %s 报告操作系统权限原因", code => {
    expect(filesystemFailure({ code }, "Read target file")).toMatchObject({
      kind: "failed", error: { code: "permission_denied", message: expect.stringContaining("operating system denied access") },
    });
  });

  it("路径长度限制指出受影响的参数", () => {
    expect(filesystemFailure({ code: "ENAMETOOLONG" }, "Resolve target.path")).toMatchObject({
      error: { code: "path_too_long", message: expect.stringContaining("target.path") },
    });
  });

  it.each(["ELOOP", "ENAMETOOLONG", "EINVAL"])("根目录错误 %s 定位资源根而非内部参数", code => {
    const result = filesystemFailure({ code }, "Resolve resource root", true);
    expect(result.kind).toBe("failed");
    expect(result.error.message).toContain("resource root");
    expect(result.error.message).not.toContain("target.path");
  });

  it("未知 I/O 错误保留系统错误码及不确定性，不输出原始异常", () => {
    const result = filesystemFailure({ code: "EIO", message: "private host path", stack: "private stack" }, "List target directory");
    expect(result.error.code).toBe("filesystem_error");
    expect(result.error.message).toContain("EIO");
    expect(result.error.message).toContain("unclassified");
    expect(result.error.message).not.toContain("private");
  });
});
