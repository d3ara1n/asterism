import { describe, expect, it } from "vitest";
import { filesystemFailure } from "./errors.ts";

describe("Filesystem error feedback", () => {
  // Verify errno mappings directly for permission and device errors, avoiding dependence on the test process's system permissions.
  it.each(["EACCES", "EPERM"])("Permission error %s reports the operating-system permission reason", code => {
    expect(filesystemFailure({ code }, "Read target file")).toMatchObject({
      kind: "failed", error: { code: "permission_denied", message: expect.stringContaining("operating system denied access") },
    });
  });

  it("Path-length limits identify the affected argument", () => {
    expect(filesystemFailure({ code: "ENAMETOOLONG" }, "Resolve target.path")).toMatchObject({
      error: { code: "path_too_long", message: expect.stringContaining("target.path") },
    });
  });

  it.each(["ELOOP", "ENAMETOOLONG", "EINVAL"])("Root-directory error %s identifies the resource root rather than internal arguments", code => {
    const result = filesystemFailure({ code }, "Resolve resource root", true);
    expect(result.kind).toBe("failed");
    expect(result.error.message).toContain("resource root");
    expect(result.error.message).not.toContain("target.path");
  });

  it("Unknown I/O errors preserve system error codes and uncertainty without exposing raw exceptions", () => {
    const result = filesystemFailure({ code: "EIO", message: "private host path", stack: "private stack" }, "List target directory");
    expect(result.error.code).toBe("filesystem_error");
    expect(result.error.message).toContain("EIO");
    expect(result.error.message).toContain("unclassified");
    expect(result.error.message).not.toContain("private");
  });
});
