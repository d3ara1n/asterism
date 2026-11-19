import { describe, expect, it } from "vitest";
import type { NpmOperation, PluginEntry } from "../../../shared/contracts";
import { installSteps, matchesFilter, pluginView } from "./model";

const entry = (patch: Partial<PluginEntry>): PluginEntry => ({
  source: "/plugins/a", id: "acme.a", origin: { kind: "path", path: "/plugins/a" }, metadata: {}, metadataError: null,
  selection: { enabled: true }, startup: { source: "/plugins/a", status: "loaded", version: "1.0.0", diagnostic: null }, pending: false, ...patch,
});
const view = (patch: Partial<PluginEntry>) => pluginView(entry(patch), new Map());

describe("plugin change", () => {
  // Startup reports "disabled" only for packages that were disabled; failed packages were enabled and must not read as "enable".
  it("compares the next selection with this run's enablement", () => {
    expect(view({ pending: true, selection: { enabled: false } }).change).toBe("disable");
    expect(view({ pending: true, startup: { source: "/plugins/a", status: "disabled", version: null, diagnostic: null } }).change).toBe("enable");
    expect(view({ pending: true, selection: { enabled: true }, startup: { source: "/plugins/a", status: "failed", version: null, diagnostic: { stage: "setup", message: "x" } } }).change).toBe("update");
  });
  it("distinguishes additions, removals, and a disabled addition that changes nothing visible", () => {
    expect(view({ pending: true, startup: null }).change).toBe("add");
    expect(view({ pending: true, startup: null, selection: { enabled: false } }).change).toBeNull();
    expect(view({ pending: true, selection: null }).change).toBe("remove");
    expect(view({}).change).toBeNull();
  });
});

describe("plugin filters", () => {
  // Bundled packages that were never selected belong only to the unfiltered list.
  it("keeps unselected bundled packages out of state filters but keeps removed running packages installed", () => {
    const available = view({ selection: null, startup: null, pending: false });
    expect(["all", "enabled", "disabled", "issues"].map(filter => matchesFilter(available, filter as never))).toEqual([true, false, false, false]);
    const removed = view({ selection: null, pending: true });
    expect(removed.installed).toBe(true);
    expect(matchesFilter(removed, "enabled")).toBe(false);
  });
  it("counts unreadable package information and frontend failures as issues", () => {
    expect(matchesFilter(view({ metadataError: "bad json" }), "issues")).toBe(true);
    expect(pluginView(entry({}), new Map([["acme.a", { status: "failed", diagnostics: [] }]])).condition).toBe("interfaceFailed");
    expect(matchesFilter(view({}), "issues")).toBe(false);
  });
});

describe("installer steps", () => {
  const operation = (phase: NpmOperation["phase"], preview = false): NpmOperation => ({ id: crypto.randomUUID(), spec: "a@latest", targetSource: null, phase,
    preview: preview ? { name: "a", version: "1.0.0", description: null, integrity: null } : null, output: "", blockedBuilds: [], error: null });
  // A failure before a resolved preview is a version-selection failure; after it, an installation failure.
  it("places failures at the step that failed", () => {
    expect(installSteps(operation("failed"))).toEqual({ version: "failed", review: "upcoming", install: "upcoming" });
    expect(installSteps(operation("failed", true))).toEqual({ version: "done", review: "done", install: "failed" });
  });
  it("waits for a decision at review and build approval", () => {
    expect(installSteps(operation("preview", true)).review).toBe("current");
    expect(installSteps(operation("awaiting-approval", true)).install).toBe("current");
    expect(installSteps(null).version).toBe("current");
  });
});
