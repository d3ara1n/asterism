import { describe, expect, it } from "vitest";
import { draftOf, validateDraft } from "./form.ts";
import type { McpServerConfig } from "./contract.ts";

const server: McpServerConfig = { id: "github", name: "GitHub", description: "", enabled: true, mode: "lazy", idleSeconds: 300,
  transport: "stdio", command: "npx", args: [], cwd: "", url: "", auth: "none" };

describe("MCP 设置表单校验", () => {
  // 新增时 ID 冲突会覆盖另一台服务器的凭据与缓存，必须在提交前按字段拒绝。
  it("新增时拒绝已占用与不合规的 ID，编辑时不校验固定 ID", () => {
    expect(validateDraft(draftOf(server, {}, true), ["github"])).toEqual({ ok: false, errors: { id: "idTaken" } });
    expect(validateDraft(draftOf({ ...server, id: "Git Hub" }, {}, true), [])).toEqual({ ok: false, errors: { id: "invalidId" } });
    expect(validateDraft(draftOf(server, {}, false), []).ok).toBe(true);
  });
  // 清空空闲秒数曾被 Number("") 变成 0；lazy 必须报错，eager 不展示该字段时沿用原值。
  it("lazy 的空闲秒数为空或越界时报错，eager 沿用原值", () => {
    const blank = { ...draftOf(server, {}, false), idle: "" };
    expect(validateDraft(blank, [])).toEqual({ ok: false, errors: { idle: "invalidTtl" } });
    const eager = validateDraft({ ...blank, server: { ...server, mode: "eager" } }, []);
    expect(eager.ok && eager.server.idleSeconds).toBe(300);
  });
  // 参数与键值以原文编辑：末尾换行不产生空 argv，键值整块读回、整块写回。
  it("保存时切分参数并解析键值，错误行按字段报告", () => {
    const draft = { ...draftOf(server, { TOKEN: "a=b" }, false), args: "-y\n@scope/server\n" };
    expect(validateDraft(draft, [])).toMatchObject({ ok: true, server: { args: ["-y", "@scope/server"] }, credentials: { TOKEN: "a=b" } });
    expect(validateDraft({ ...draft, entries: "TOKEN" }, [])).toEqual({ ok: false, errors: { entries: "invalidEntries" } });
  });
  it("HTTP 地址为空与协议不符分别报告", () => {
    const http = { ...draftOf({ ...server, transport: "http" }, {}, false) };
    expect(validateDraft(http, [])).toEqual({ ok: false, errors: { url: "required" } });
    expect(validateDraft({ ...http, server: { ...http.server, url: "ftp://host" } }, [])).toEqual({ ok: false, errors: { url: "invalidUrl" } });
  });
});
