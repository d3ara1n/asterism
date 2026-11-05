import { describe, expect, it } from "vitest";
import type { ProviderSetting } from "@asterism-app/sdk/contracts";
import { resolveProviderSettings } from "./provider-settings.ts";

const settings: ProviderSetting[] = [
  { kind: "secret", key: "token", label: "Token", required: true },
  { kind: "secret", key: "extra", label: "Extra", required: false },
  { kind: "text", key: "account", label: "Account", required: true },
  { kind: "text", key: "note", label: "Note", required: false },
  { kind: "choice", key: "mode", label: "Mode", default: "auto", options: [{ value: "auto", label: "Auto" }, { value: "deep", label: "Deep" }] },
];
const resolve = async (value: string) => `resolved:${value}`;

describe("Provider setting resolution", () => {
  // Saved text is persisted trimmed, but a declaration change can make a previously optional value required.
  it("resolves only secrets, trims text, omits blank optional values, and rejects a blank required value", async () => {
    expect(await resolveProviderSettings(settings, { token: "!cmd", account: " team ", note: "  " }, resolve))
      .toEqual({ token: "resolved:!cmd", account: "team", mode: "auto" });
    await expect(resolveProviderSettings(settings, { token: "t", account: " " }, resolve))
      .rejects.toMatchObject({ reason: "missing", key: "account" });
  });
});
