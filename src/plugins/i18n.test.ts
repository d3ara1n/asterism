import { mkdtempSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defineMessages, defineAction, pluginNamespace, withValues, uiTextSchema, localeSchema, present } from "@asterism-app/sdk/contracts";
import { z } from 'zod';
import { applyPreparation } from "./commands.ts";
import { readManifest } from "./packages.ts";
import { loadCatalogs } from "./catalogs.ts";
import type { ApplicationService } from "../runtime/service.ts";
import { serveSession } from "../runtime/dispatch.ts";
import { PluginApiError } from "@asterism-app/sdk/runtime";
import sdkMetadata from "@asterism-app/sdk/package.json" with { type: "json" };

const roots: string[] = [];
const temp = () => { const root = mkdtempSync(join(tmpdir(), "asterism-i18n-")); roots.push(root); return root; };
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("Plugin catalogs and presentation IPC", () => {
  // Localized messages can be nested in persisted/presented data; locale normalization must encode as well as decode.
  it("round-trips localized presentation data and validates locale tags before normalization", () => {
    const ns = pluginNamespace("example.localized");
    const message = ns.messages("EN-us", { title: { id: "title", defaultMessage: "Shared title" } }).title;
    const contract = ns.data("label", z.object({ label: uiTextSchema }));
    const encoded = present(contract, { label: message });
    expect(contract.schema.parse(encoded.data)).toEqual({ label: { ...message, sourceLocale: "en-US" } });
    expect(localeSchema.safeParse("not_a_locale").success).toBe(false);
    expect(z.safeEncode(localeSchema, "not_a_locale").success).toBe(false);
  });
  it("catalog paths cannot escape package roots or symlinks; corrupt translations produce diagnostics only and normalized duplicate manifest tags are rejected", () => {
    const root = temp(), outside = temp(), diagnostics: string[] = [];
    writeFileSync(join(outside, "catalog.json"), "{}"); symlinkSync(join(outside, "catalog.json"), join(root, "linked.json"));
    expect(loadCatalogs(root, "example.test", { en: "linked.json", fr: "missing.json" }, message => diagnostics.push(message))).toEqual([]);
    expect(diagnostics.length).toBeGreaterThan(0);
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "x", peerDependencies: { "@asterism-app/sdk": `^${sdkMetadata.version}` }, asterism: { displayName: "Test plugin", id: "example.test", i18n: { catalogs: { en: "a.json", EN: "b.json" } } } }));
    expect(() => readManifest(root)).toThrow();
  });
  it("preparation reason codes and display pass through command IPC; custom reasons without display retain English fallbacks", async () => {
    const ns = pluginNamespace("example.counter"), messages = ns.messages("en", defineMessages({ limit: { id: "limit", defaultMessage: "Limit: {limit}" } }));
    const display = withValues(messages.limit, { limit: 20 });
    const action = defineAction(ns.resource("counter", z.object({})), { id: ns.name("change"), schema: z.object({}) });
    const fake = { sessions: { execute: async () => { applyPreparation(action, {}, {
      action: "reject", code: "limit_exceeded", message: "The count exceeds the limit.", display,
    }); } } } as unknown as ApplicationService;
    const request = { type: "read", sessionId: "s" };
    const result = await serveSession(fake, request);
    expect(result).toEqual({ ok: false, error: { code: "limit_exceeded", message: "The count exceeds the limit.", display } });
    fake.sessions.execute = async () => { throw new PluginApiError("rejected", "Custom reason.", "custom_reason"); };
    expect(await serveSession(fake, request)).toEqual({ ok: false, error: { code: "custom_reason", message: "Custom reason.", display: "Custom reason." } });
  });
});
