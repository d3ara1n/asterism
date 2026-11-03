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
const secrets = (values: Record<string, string>) => async (key: string) => values[key] ?? null;

describe("Provider setting resolution", () => {
  // Saved text is persisted trimmed, but a declaration change can make a previously optional text required.
  it("trims text, omits blank optional values, and rejects a required text that is blank", async () => {
    expect(await resolveProviderSettings(settings, { account: " team ", note: "  " }, secrets({ token: "t" })))
      .toEqual({ token: "t", account: "team", mode: "auto" });
    await expect(resolveProviderSettings(settings, { account: " " }, secrets({ token: "t" })))
      .rejects.toMatchObject({ reason: "missing", key: "account" });
  });
});
