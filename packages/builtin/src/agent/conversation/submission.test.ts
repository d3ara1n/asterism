import { describe, expect, it } from "vitest";
import { SubmissionIdentity } from "./submission";

// Expectations follow the submission identity contract: retries of the same input retain identity; after acceptance, identical text is a new submission.
describe("Submission identity", () => {
  it("Retains submission identity after a lost response, and assigns a new identity to identical text after acceptance", () => {
    const identity = new SubmissionIdentity(), input = { text: "Hello" };
    const first = identity.forInput(input);
    expect(identity.forInput(input)).toBe(first);
    identity.accepted();
    expect(identity.forInput(input)).not.toBe(first);
  });
});
