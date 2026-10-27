import { expect, it } from "vitest";
import { workbenchPhase } from "./feedback";

// loading means only that initial content is not ready; background updates preserve the existing workbench.
it("presents initial reading, read errors, and backend unavailability separately", () => {
  expect(workbenchPhase("starting", null)).toBe("starting");
  expect(workbenchPhase("ready", null)).toBe("loading");
  expect(workbenchPhase("ready", { status: "loading" })).toBe("loading");
  expect(workbenchPhase("ready", { status: "ready" })).toBe("ready");
  expect(workbenchPhase("ready", { status: "error" })).toBe("read-error");
  expect(workbenchPhase("unavailable", { status: "ready" })).toBe("unavailable");
  expect(workbenchPhase("stopping", { status: "error" })).toBe("unavailable");
});
