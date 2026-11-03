import { describe, expect, it } from "vitest";
import type { ProviderSetting } from "@asterism-app/sdk/contracts";
import { validateProviderSettings } from "./provider-settings.ts";

const settings: ProviderSetting[] = [
  { kind: "secret", key: "token", label: "Token", required: true },
  { kind: "secret", key: "extra", label: "Extra", required: false },
  { kind: "text", key: "account", label: "Account", required: true },
  { kind: "text", key: "note", label: "Note", required: false },
  { kind: "choice", key: "mode", label: "Mode", default: "auto", options: [{ value: "auto", label: "Auto" }, { value: "deep", label: "Deep" }] },
];

describe("Provider setting validation", () => {
  const kept = new Set(["token"]);
  it("persists submitted values only and leaves unsubmitted choices to follow the declared default", () => {
    expect(validateProviderSettings(settings, { account: " team ", note: "" }, {}, kept)).toEqual({ account: "team" });
    expect(validateProviderSettings(settings, { account: "team", mode: "deep" }, {}, kept)).toEqual({ account: "team", mode: "deep" });
    expect(validateProviderSettings(settings, { account: " " }, {}, kept)).toBeNull();
  });
  // Secrets must never enter the plain settings record; selected choices must belong to the declaration.
  it("rejects undeclared keys, secrets submitted as plain values, and unsupported choices", () => {
    expect(validateProviderSettings(settings, { account: "a", other: "x" }, {}, kept)).toBeNull();
    expect(validateProviderSettings(settings, { account: "a", token: "plain" }, {}, kept)).toBeNull();
    expect(validateProviderSettings(settings, { account: "a" }, { account: { action: "replace", value: "x" } }, kept)).toBeNull();
    expect(validateProviderSettings(settings, { account: "a", mode: "removed" }, {}, kept)).toBeNull();
  });
  it("requires required secrets to be kept from a saved reference or replaced", () => {
    expect(validateProviderSettings(settings, { account: "a" }, {}, new Set())).toBeNull();
    expect(validateProviderSettings(settings, { account: "a" }, { token: { action: "clear" } }, kept)).toBeNull();
    expect(validateProviderSettings(settings, { account: "a" }, { token: { action: "replace", value: "new" } }, new Set())).toEqual({ account: "a" });
    expect(validateProviderSettings(settings, { account: "a" }, { extra: { action: "clear" } }, kept)).toEqual({ account: "a" });
  });
});
