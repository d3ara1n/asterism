import type { CallResult } from "../../tools/contract.ts";

type Failure = Extract<CallResult<never>, { kind: "failed" | "rejected" }>;

/** 文件系统预期失败携带可公开的原因与下一步；不返回原始异常中的宿主路径或堆栈。 */
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
      return failed(root ? "resource_not_found" : "path_not_found", `${operation}: ${subject} does not exist or contains a broken symbolic link. ${root
        ? "Use resource_inspect to check the resource and ask the user to restore or relink the directory."
        : "Use list on the resource root or an existing parent directory, then correct target.path."}`);
    case "ENOTDIR":
      return failed(root ? "resource_not_directory" : "not_directory", `${operation}: ${subject} or one of its path components is not a directory. ${root
        ? "Ask the user to relink an existing directory."
        : "Use list on an existing parent to check entry types, then correct target.path to select a directory."}`);
    case "EACCES": case "EPERM":
      return failed("permission_denied", `${operation}: The operating system denied access to ${root ? "the resource root" : "the target"}. Ask the user to check filesystem permissions and application access. Retrying the same call without a permission change will not help.`);
    case "ELOOP":
      return failed("symlink_loop", `${operation}: Symbolic link resolution exceeded the system limit, possibly due to a loop. ${root
        ? "Ask the user to repair the resource root's symbolic links or relink the directory."
        : "Choose another path within the resource or ask the user to repair the link."}`);
    case "ENAMETOOLONG":
      return failed("path_too_long", `${operation}: The path exceeds a filesystem length limit. ${root
        ? "Ask the user to relink the resource root using a valid directory path."
        : "Use list to find the intended entry and correct or shorten target.path."}`);
    case "EINVAL": case "ERR_INVALID_ARG_VALUE":
      return root
        ? failed("invalid_resource_path", `${operation}: The filesystem rejected the resource root path syntax. Ask the user to relink an existing directory using a valid path.`)
        : rejected("invalid_path", `${operation}: The filesystem rejected the path syntax. Correct target.path to a valid relative path without NUL characters.`);
    default: {
      const systemCode = /^[A-Z][A-Z0-9_]+$/.test(code) ? code : "unknown";
      return failed("filesystem_error", `${operation}: A filesystem operation failed (${systemCode}); the cause could not be classified. Inspect the resource and ask the user to check its availability if the error persists. Do not assume the path is missing or change arguments without evidence.`);
    }
  }
}
