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
  it("persists trimmed nonempty values and leaves unsubmitted choices to follow the declared default", () => {
    expect(validateProviderSettings(settings, { token: " t ", extra: " ", account: " team ", note: "" })).toEqual({ token: "t", account: "team" });
    expect(validateProviderSettings(settings, { token: "t", account: "team", mode: "deep" })).toEqual({ token: "t", account: "team", mode: "deep" });
  });
  it("rejects blank required values of either kind", () => {
    expect(validateProviderSettings(settings, { token: "t", account: " " })).toBeNull();
    expect(validateProviderSettings(settings, { token: " ", account: "a" })).toBeNull();
  });
  it("rejects undeclared keys and unsupported choices", () => {
    expect(validateProviderSettings(settings, { token: "t", account: "a", other: "x" })).toBeNull();
    expect(validateProviderSettings(settings, { token: "t", account: "a", mode: "removed" })).toBeNull();
  });
});
