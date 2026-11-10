# Remove tests whose only possible fix is updating the expectation

Filed on 2026-11-10 while preparing a release. Deferred: audit the suite and sharpen the testing guidance.

## Trigger

`src/resources/resources.test.ts` asserted the exact key list returned by each `resource_inspect` detail view. A later commit intentionally added `result` to the schema view, and the full suite failed. The only possible response was to edit the expected list, so the failure found no defect. The three key-list assertions were removed to unblock the release; the name narrowing and unknown-name rejection checks in the same case remain.

## Work

- [ ] Audit the test suite for assertions whose failure can only be resolved by updating the expectation: exact field or key lists of projections, literal catalog or copy contents, enumerations restated from the implementation, and output shapes that mirror the producing code.
- [ ] Remove those assertions or cases. Keep a case only when its failure points to a defect in the code under test.
- [ ] Amend the Validation section of AGENTS.md with an operational criterion: before writing an assertion, ask what a failure would require. If the only response is changing the expected value, do not write it. The existing "implementation-mirroring assertions" rule did not prevent this case.
