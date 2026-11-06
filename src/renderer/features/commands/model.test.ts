import { describe, expect, it } from "vitest";
import type { RendererCommand } from "@asterism-app/sdk/renderer";
import { resolveCommandPage } from "./model";

const action = (id: string): RendererCommand => ({ id, label: id, onAction() {} });

describe("command page resolution", () => {
  it("follows nested sibling identities rather than contribution order", () => {
    const commands: RendererCommand[] = [action("other"), {
      id: "theme", label: "Theme", children: [action("other"), {
        id: "mode", label: "Mode", children: [action("system"), action("dark")],
      }],
    }];
    const page = resolveCommandPage(commands, ["theme", "mode"]);
    expect(page?.commands.map(command => command.id)).toEqual(["system", "dark"]);
    expect(page?.parent?.label).toBe("Mode");
  });

  it("does not expose descendants of a page that became inapplicable", () => {
    expect(resolveCommandPage([{
      id: "session", label: "Session", when: false, children: [action("rename")],
    }], ["session"])).toBeNull();
  });

  it("does not reinterpret a removed page or an action as a nested page", () => {
    expect(resolveCommandPage([action("updates")], ["theme"])).toBeNull();
    expect(resolveCommandPage([action("updates")], ["updates"])).toBeNull();
  });

  it("keeps descendants disabled when an ancestor is busy even if the immediate parent is enabled", () => {
    const commands: RendererCommand[] = [{
      id: "settings", label: "Settings", disabled: true, children: [{
        id: "theme", label: "Theme", children: [action("system")],
      }],
    }];
    expect(resolveCommandPage(commands, ["settings", "theme"])?.disabled).toBe(true);
  });

  it("rejects duplicate siblings on an addressed nested page without rejecting identity reuse at another level", () => {
    const valid: RendererCommand[] = [{ id: "theme", label: "Theme", children: [action("theme")] }];
    expect(resolveCommandPage(valid, ["theme"])?.commands.map(command => command.id)).toEqual(["theme"]);
    expect(() => resolveCommandPage([{
      id: "theme", label: "Theme", children: [action("system"), action("system")],
    }], ["theme"])).toThrow("Command IDs must be unique non-empty trimmed strings among siblings.");
  });
});
