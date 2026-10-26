# Timeline-derived state

Filed on 2026-10-13. Completed.

Snapshots captured the timeline endpoint, append upper bound, and title, loading records only when queried. Later writes and cursor changes left existing observations fixed.

The workbench reconstructed resource presence and links from the execution cursor. Display, object validation, and request access used that one result. Independent historical preview state was removed; selecting a history item became a candidate until explicit continuation.

The tree retained all records, a timeline remained one ancestor path, and branches were UI organization. Current layout and note contents remained outside historical reconstruction.

Host reconstruction occurred within the transaction boundary. Plugin-derived state updated through post-commit cursor observation, whose failure logged without rolling back the original commit.

Explicit cursor selections had a separate log outside model context. Domain state reconstruction remained the resource's responsibility rather than a new generic query abstraction.
