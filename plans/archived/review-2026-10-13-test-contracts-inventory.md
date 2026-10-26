# Test-contract cleanup inventory

Archived review filed on 2026-10-13. Its findings were consumed by the completed test cleanup. Original per-file line numbers described the pre-cleanup baseline and were not durable test requirements.

The baseline had 55 files and 354 case declarations, expanding to 395 cases. The completed suite had 62 files and 342 declarations, expanding to 386 passing cases. New files separated contracts previously mixed into integration tests; counts were evidence, not acceptance targets.

The cleanup assigned text, paths, Agent projection, workbench reconstruction, assembly, record decoding, configuration, and transport validation to their actual owning boundaries. It removed duplicated downstream checks, literal diagnostic formatting, fixed component identity, internal-field assertions, and equivalent samples.

Malformed configuration fixtures began from valid current data so missing-category and duplicate-identity cases exercised those errors rather than only failing a version check. A content-branch fixture used a reference owned only by the sibling branch, establishing actual access and claim rejection.

A concurrent historical-record correction changed persistence to save completion with the highest-ordinal actual block and let every record advance the cursor. Tests were updated to the resulting contract rather than preserving obsolete baseline output.

Typechecks, tests, localization checks, and whitespace checks passed. Image-read tests passed independently. GUI and real-provider behavior were not claimed as automated acceptance.

The work introduced no production interface or test framework. Tests retained meaningful observable parsing, no-retry, indexing, rollback, and ownership guarantees while dropping implementation replicas.
