import { describe, expect, it } from "vitest";
import type { CreationEntry, DropAccepts, DropItem } from "@atelier/sdk/renderer";
import { acceptsItem, dropCandidates, rememberedEntry, routeKey } from "./routing";

const file = (name: string, mime = "", directory = false): DropItem => ({ kind: "file", path: `/tmp/${name}`, name, mime, directory });
const entry = (id: string, accepts: DropAccepts): CreationEntry =>
  ({ id, label: id, triggers: { drop: { accepts, toInput: () => null } } }) as unknown as CreationEntry;

describe("拖放声明式匹配", () => {
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
  });
  it("URL 按 scheme 过滤，非法 URL 不受理", () => {
    const accepts = { urls: { schemes: ["https"] } };
    expect(acceptsItem(accepts, { kind: "url", url: "HTTPS://example.com/a" })).toBe(true);
    expect(acceptsItem(accepts, { kind: "url", url: "file:///etc/hosts" })).toBe(false);
    expect(acceptsItem(accepts, { kind: "url", url: "not a url" })).toBe(false);
  });
  it("候选只包含受理该项的入口", () => {
    const pdf = entry("a.x/pdf", { files: { extensions: [".pdf"] } });
    const dir = entry("a.x/dir", { files: { directories: true } });
    expect(dropCandidates([pdf, dir], file("a.pdf")).map(e => e.id)).toEqual(["a.x/pdf"]);
  });
});

describe("路由记忆键", () => {
  it("按扩展名 > MIME 的优先级取判别项，不同类型互不污染", () => {
    expect(routeKey(file("a.PDF", "application/pdf"))).toBe(routeKey(file("b.pdf", "")));
    expect(routeKey(file("a.pdf"))).not.toBe(routeKey(file("a.png")));
    expect(routeKey(file("noext", "image/png"))).toContain("mime:image/png");
    expect(routeKey(file("project", "", true))).not.toBe(routeKey(file("project")));
  });
  it("记忆只在仍属当前候选时命中", () => {
    const candidates = [entry("a.x/one", { text: true })];
    expect(rememberedEntry(candidates, "a.x/one")?.id).toBe("a.x/one");
    expect(rememberedEntry(candidates, "a.x/removed")).toBeNull();
    expect(rememberedEntry(candidates, null)).toBeNull();
  });
});
