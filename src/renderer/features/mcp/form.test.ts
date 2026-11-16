import { describe, expect, it } from "vitest";
import { draftOf, validateDraft } from "./form.ts";
import type { McpServerConfig } from "@asterism-app/sdk/contracts";

const server: McpServerConfig = { id: "github", name: "GitHub", enabled: true, mode: "lazy", idleSeconds: 300,
  transport: "stdio", command: "npx", args: [], cwd: "", url: "", auth: "none", env: {}, headers: {} };

describe("MCP settings form validation", () => {
  it("combines edited details with the latest row toggle in either direction", () => {
    for (const enabled of [false, true]) {
      const draft = draftOf({ ...server, enabled: !enabled }, false);
      draft.server.name = "  Edited server  ";
      expect(validateDraft(draft, [], enabled)).toMatchObject({
        ok: true, server: { name: "Edited server", enabled },
      });
    }
  });

  // An ID collision during creation would overwrite another server's credentials and cache; reject it at the field level before submission.
  it("rejects taken or invalid IDs on creation and does not validate the fixed ID when editing", () => {
    expect(validateDraft(draftOf(server, true), ["github"], true)).toEqual({ ok: false, errors: { id: "idTaken" } });
    expect(validateDraft(draftOf({ ...server, id: "Git Hub" }, true), [], true)).toEqual({ ok: false, errors: { id: "invalidId" } });
    expect(validateDraft(draftOf(server, false), [], true).ok).toBe(true);
  });
  // Clearing idle seconds previously became 0 through Number(""); lazy must report an error, while eager retains the original value when the field is hidden.
  it("reports empty or out-of-range idle seconds for lazy and retains the original value for eager", () => {
    const blank = { ...draftOf(server, false), idle: "" };
    expect(validateDraft(blank, [], true)).toEqual({ ok: false, errors: { idle: "invalidTtl" } });
    const eager = validateDraft({ ...blank, server: { ...server, mode: "eager" } }, [], true);
    expect(eager.ok && eager.server.idleSeconds).toBe(300);
  });
  // Arguments and key-value pairs are edited as raw text: a trailing newline creates no empty argv, and key-value pairs are read and written as a whole.
  it("splits arguments and parses key-value pairs on save, reporting invalid lines by field", () => {
    const draft = { ...draftOf({ ...server, env: { TOKEN: "a=b" } }, false), args: "-y\n@scope/server\n" };
    expect(validateDraft(draft, [], true)).toMatchObject({ ok: true, server: { args: ["-y", "@scope/server"], env: { TOKEN: "a=b" } } });
    expect(validateDraft({ ...draft, entries: "TOKEN" }, [], true)).toEqual({ ok: false, errors: { entries: "invalidEntries" } });
  });
  it("reports an empty HTTP address and an unsupported protocol separately", () => {
    const http = { ...draftOf({ ...server, transport: "http" }, false) };
    expect(validateDraft(http, [], true)).toEqual({ ok: false, errors: { url: "required" } });
    expect(validateDraft({ ...http, server: { ...http.server, url: "ftp://host" } }, [], true)).toEqual({ ok: false, errors: { url: "invalidUrl" } });
  });
});
