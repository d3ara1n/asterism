import { describe, expect, it, vi } from "vitest";
import { CredentialResolver, type CredentialCommand } from "./credentials.ts";

function deferred() {
  let resolve!: (value: string) => void, reject!: (error: Error) => void;
  const promise = new Promise<string>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const resolver = (run: CredentialCommand) => new CredentialResolver(new AbortController().signal, run);

describe("Credential expressions", () => {
  it("preserves literal values and internal exclamation marks without executing a command", async () => {
    const run = vi.fn<CredentialCommand>();
    expect(await resolver(run).resolve("key!with spaces ")).toBe("key!with spaces ");
    expect(run).not.toHaveBeenCalled();
  });

  it("executes the expression after its prefix and trims only the output boundaries", async () => {
    const run = vi.fn<CredentialCommand>(async () => " \tfirst line\nsecond line\r\n");
    expect(await resolver(run).resolve("! rbw get 'model key' ")).toBe("first line\nsecond line");
    expect(run).toHaveBeenCalledWith("rbw get 'model key'", expect.any(AbortSignal));
  });

  it("rejects an empty command before execution", async () => {
    const run = vi.fn<CredentialCommand>();
    await expect(resolver(run).resolve("! \t")).rejects.toThrow("The credential command is empty.");
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects empty command output rather than using it as a credential", async () => {
    await expect(resolver(async () => " \r\n\t").resolve("!rbw get model-key")).rejects.toThrow("The credential command returned no value.");
  });

  it("reports command failure without exposing the command, stdout, or stderr from the process error", async () => {
    const run = async () => { throw new Error("Command failed: private-command\nstdout=private-key\nstderr=private-token"); };
    await expect(resolver(run).resolve("!private-command")).rejects.toThrow(
      /^The credential command failed\. Check the command and unlock the credential manager\.$/u);
  });
});

describe("Credential command lifetime", () => {
  it("runs a command once for concurrent and later readers", async () => {
    const output = deferred();
    const run = vi.fn<CredentialCommand>(() => output.promise);
    const credentials = resolver(run);
    const first = credentials.resolve("!rbw get model-key"), second = credentials.resolve("!rbw get model-key");
    output.resolve("model-key\n");
    expect(await Promise.all([first, second])).toEqual(["model-key", "model-key"]);
    expect(await credentials.resolve("!rbw get model-key")).toBe("model-key");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("does not retain failures, so a later read runs the command again", async () => {
    const run = vi.fn<CredentialCommand>().mockRejectedValueOnce(new Error("locked")).mockResolvedValueOnce("model-key");
    const credentials = resolver(run);
    await expect(credentials.resolve("!rbw get model-key")).rejects.toThrow();
    expect(await credentials.resolve("!rbw get model-key")).toBe("model-key");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("keeps a shared command running while any reader waits and stops it once all readers cancel", async () => {
    let signal!: AbortSignal;
    const output = deferred();
    const run = vi.fn<CredentialCommand>((_command, received) => {
      signal = received;
      received.addEventListener("abort", () => output.reject(new Error("killed")), { once: true });
      return output.promise;
    });
    const credentials = resolver(run);
    const first = new AbortController(), second = new AbortController();
    const firstRead = credentials.resolve("!rbw get model-key", first.signal);
    const secondRead = credentials.resolve("!rbw get model-key", second.signal);
    first.abort();
    await expect(firstRead).rejects.toBe(first.signal.reason);
    expect(signal.aborted).toBe(false);
    second.abort();
    await expect(secondRead).rejects.toBe(second.signal.reason);
    expect(signal.aborted).toBe(true);
    run.mockResolvedValueOnce("model-key");
    expect(await credentials.resolve("!rbw get model-key")).toBe("model-key");
  });
});
