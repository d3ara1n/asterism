import type { CallResult } from "@atelier/sdk/runtime";

type Failure = Extract<CallResult<never>, { kind: "failed" | "rejected" }>;

/** 文件系统预期失败携带可公开的原因；原始宿主路径和堆栈留在实现边界。 */
export class FilesystemError extends Error {
  constructor(readonly outcome: Failure) {
    super(outcome.error.message);
  }
}

export const failed = (code: string, message: string): Failure => ({ kind: "failed", error: { code, message } });
export const rejected = (code: string, message: string): Failure => ({ kind: "rejected", error: { code, message } });

export function filesystemFailure(error: unknown, operation: string, root = false): Failure {
  if (error instanceof FilesystemError) return error.outcome;
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "";
  const subject = root ? "The directory resource root" : "The target path";
  switch (code) {
    case "ENOENT":
      return failed(root ? "resource_not_found" : "path_not_found", `${operation}: ${subject} is missing or contains a broken symbolic link.`);
    case "ENOTDIR":
      return failed(root ? "resource_not_directory" : "not_directory", `${operation}: ${subject} requires directory entries along its directory path.`);
    case "EACCES": case "EPERM":
      return failed("permission_denied", `${operation}: The operating system denied access to ${root ? "the resource root" : "the target"}. Access depends on filesystem permissions and application access.`);
    case "ELOOP":
      return failed("symlink_loop", `${operation}: Symbolic link resolution for ${subject.toLowerCase()} exceeded the system limit, possibly due to a loop.`);
    case "ENAMETOOLONG":
      return failed("path_too_long", `${operation}: ${root ? "The resource root path" : "target.path"} exceeds a filesystem length limit.`);
    case "EINVAL": case "ERR_INVALID_ARG_VALUE":
      return root
        ? failed("invalid_resource_path", `${operation}: The filesystem rejected the resource root path syntax.`)
        : rejected("invalid_path", `${operation}: The filesystem rejected target.path syntax.`);
    default: {
      const systemCode = /^[A-Z][A-Z0-9_]+$/.test(code) ? code : "unknown";
      return failed("filesystem_error", `${operation}: A filesystem operation failed (${systemCode}); the cause is unclassified.`);
    }
  }
}
