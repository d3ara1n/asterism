import { describe, expect, it } from "vitest";
import type { CreationEntry, DropAccepts, DropItem } from "@asterism/sdk/renderer";
import { acceptsItem, dropCandidates, rememberedEntry, routeKey } from "./routing";

const file = (name: string, mime = "", directory = false): DropItem => ({ kind: "file", file: new File([], name), path: `/tmp/${name}`, name, mime, directory });
const entry = (id: string, accepts: DropAccepts): CreationEntry =>
  ({ id, label: id, triggers: { drop: { accepts, toInput: () => null } } }) as unknown as CreationEntry;

describe("Declarative drag-and-drop matching", () => {
  it("does not deliver files without paths to requiresPath or directory entries, and keeps routing memory independent of path source", () => {
    const item: DropItem = { kind: "file", file: new File([new Uint8Array([1])], "paste.png", { type: "image/png" }), name: "paste.png", mime: "image/png", directory: false };
    expect(acceptsItem({ files: { mime: ["image/*"], requiresPath: true } }, item)).toBe(false);
    expect(acceptsItem({ files: { directories: true } }, item)).toBe(false);
    expect(acceptsItem({ files: { mime: ["image/*"] } }, item)).toBe(true);
    expect(acceptsItem({ files: { extensions: [".pdf"] } }, item)).toBe(false);
    expect(routeKey(item)).not.toBe(routeKey(file("paste.png", "image/png")));
  });
  it("accepts directories only through entries explicitly declaring directories, without ordinary file entries accepting them", () => {
    expect(acceptsItem({ files: { directories: true } }, file("project", "", true))).toBe(true);
    expect(acceptsItem({ files: {} }, file("project", "", true))).toBe(false);
    // Directory-only entries do not accept ordinary files.
    expect(acceptsItem({ files: { directories: true } }, file("a.txt"))).toBe(false);
  });
  it("matches extensions case-insensitively and supports MIME wildcards, accepting on any match", () => {
    expect(acceptsItem({ files: { extensions: [".pdf"] } }, file("Report.PDF"))).toBe(true);
    expect(acceptsItem({ files: { mime: ["image/*"] } }, file("noext", "image/png"))).toBe(true);
    expect(acceptsItem({ files: { mime: ["image/*"] } }, file("a.pdf", "application/pdf"))).toBe(false);
    const entries = [entry("image", { files: { mime: ["image/*"] } }), entry("pdf", { files: { extensions: [".pdf"] } })];
    expect(dropCandidates(entries, file("a.png", "image/png")).map(item => item.id)).toEqual(["image"]);
  });
  it("filters URLs by scheme and rejects invalid URLs", () => {
    const accepts = { urls: { schemes: ["https"] } };
    expect(acceptsItem(accepts, { kind: "url", url: "HTTPS://example.com/a" })).toBe(true);
    expect(acceptsItem(accepts, { kind: "url", url: "file:///etc/hosts" })).toBe(false);
    expect(acceptsItem(accepts, { kind: "url", url: "not a url" })).toBe(false);
  });
});

describe("Routing memory keys", () => {
  it("selects the discriminator by extension > MIME priority without mixing different types", () => {
    expect(routeKey(file("a.PDF", "application/pdf"))).toBe(routeKey(file("b.pdf", "")));
    expect(routeKey(file("a.pdf"))).not.toBe(routeKey(file("a.png")));
    expect(routeKey(file("noext", "image/png"))).toBe(routeKey(file("other", "image/png")));
    expect(routeKey(file("noext", "image/png"))).not.toBe(routeKey(file("noext", "image/jpeg")));
    expect(routeKey(file("project", "", true))).not.toBe(routeKey(file("project")));
  });
  it("matches remembered choices only while they remain current candidates", () => {
    const candidates = [entry("a.x/one", { text: true })];
    expect(rememberedEntry(candidates, "a.x/one")?.id).toBe("a.x/one");
    expect(rememberedEntry(candidates, "a.x/removed")).toBeNull();
    expect(rememberedEntry(candidates, null)).toBeNull();
  });
});
