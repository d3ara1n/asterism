import { describe, expect, it } from "vitest";
import type { CreationEntry, DropAccepts, DropItem } from "@atelier/sdk/renderer";
import { acceptsItem, dropCandidates, rememberedEntry, routeKey } from "./routing";

const file = (name: string, mime = "", directory = false): DropItem => ({ kind: "file", file: new File([], name), path: `/tmp/${name}`, name, mime, directory });
const entry = (id: string, accepts: DropAccepts): CreationEntry =>
  ({ id, label: id, triggers: { drop: { accepts, toInput: () => null } } }) as unknown as CreationEntry;

describe("拖放声明式匹配", () => {
  it("无路径文件不交付 requiresPath 或目录入口，路由记忆与路径来源独立", () => {
    const item: DropItem = { kind: "file", file: new File([new Uint8Array([1])], "paste.png", { type: "image/png" }), name: "paste.png", mime: "image/png", directory: false };
    expect(acceptsItem({ files: { mime: ["image/*"], requiresPath: true } }, item)).toBe(false);
    expect(acceptsItem({ files: { directories: true } }, item)).toBe(false);
    expect(acceptsItem({ files: { mime: ["image/*"] } }, item)).toBe(true);
    expect(acceptsItem({ files: { extensions: [".pdf"] } }, item)).toBe(false);
    expect(routeKey(item)).not.toBe(routeKey(file("paste.png", "image/png")));
  });
  it("目录只由显式声明 directories 的入口受理，普通文件入口不误收目录", () => {
    expect(acceptsItem({ files: { directories: true } }, file("project", "", true))).toBe(true);
    expect(acceptsItem({ files: {} }, file("project", "", true))).toBe(false);
    // 只收目录的入口不受理普通文件。
    expect(acceptsItem({ files: { directories: true } }, file("a.txt"))).toBe(false);
  });
  it("扩展名不区分大小写，MIME 支持通配，任一命中即受理", () => {
    expect(acceptsItem({ files: { extensions: [".pdf"] } }, file("Report.PDF"))).toBe(true);
    expect(acceptsItem({ files: { mime: ["image/*"] } }, file("noext", "image/png"))).toBe(true);
    expect(acceptsItem({ files: { mime: ["image/*"] } }, file("a.pdf", "application/pdf"))).toBe(false);
    const entries = [entry("image", { files: { mime: ["image/*"] } }), entry("pdf", { files: { extensions: [".pdf"] } })];
    expect(dropCandidates(entries, file("a.png", "image/png")).map(item => item.id)).toEqual(["image"]);
  });
  it("URL 按 scheme 过滤，非法 URL 不受理", () => {
    const accepts = { urls: { schemes: ["https"] } };
    expect(acceptsItem(accepts, { kind: "url", url: "HTTPS://example.com/a" })).toBe(true);
    expect(acceptsItem(accepts, { kind: "url", url: "file:///etc/hosts" })).toBe(false);
    expect(acceptsItem(accepts, { kind: "url", url: "not a url" })).toBe(false);
  });
});

describe("路由记忆键", () => {
  it("按扩展名 > MIME 的优先级取判别项，不同类型互不污染", () => {
    expect(routeKey(file("a.PDF", "application/pdf"))).toBe(routeKey(file("b.pdf", "")));
    expect(routeKey(file("a.pdf"))).not.toBe(routeKey(file("a.png")));
    expect(routeKey(file("noext", "image/png"))).toBe(routeKey(file("other", "image/png")));
    expect(routeKey(file("noext", "image/png"))).not.toBe(routeKey(file("noext", "image/jpeg")));
    expect(routeKey(file("project", "", true))).not.toBe(routeKey(file("project")));
  });
  it("记忆只在仍属当前候选时命中", () => {
    const candidates = [entry("a.x/one", { text: true })];
    expect(rememberedEntry(candidates, "a.x/one")?.id).toBe("a.x/one");
    expect(rememberedEntry(candidates, "a.x/removed")).toBeNull();
    expect(rememberedEntry(candidates, null)).toBeNull();
  });
});
