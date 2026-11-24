# Plugin record migration review

Reviewed the behavior introduced by `a09bd735`. The separation is sound: the workspace schema, private plugin stores, and owned history formats have different owners and reasons to change. The host selects records by contract and stamped owner, changes only encoded payload data, and commits it with the group version. A failed group leaves its rows and version unchanged. This preserves the history model: runtime writes do not rewrite completed facts, while startup preparation can change their encoding. Content reference membership stays fixed, so migration does not need to rebuild content roots.

## High: the version registry does not bind the contract set

[Record storage](../src/storage/record-storage.ts) persists the group identity and version, but not the contracts covered by that version. Declaration validation only checks overlaps within the package currently being loaded. The version lookup short-circuits migration when versions match, even when the declaration includes different contracts.

Reproduced with local SQLite fixtures: prepare a group at version 2 while a second contract has version-1 rows outside that group. Add the second contract to the same version-2 declaration. Preparation reports success and leaves the newly included old rows untouched. Removing a member at the same version also succeeds, bypassing the safeguard that catches a completely missing group. Moving a contract to a new group can instead run its old rows through the wrong migration chain.

Recommendation: persist the canonical membership alongside the version, reject unexplained changes before preparing or loading the plugin, and use a new group for independent new contracts. Do not silently adopt an existing contract into an already versioned group. If broader group restructuring becomes necessary, define an explicit transition with source-version semantics then. Decide how already stamped workspaces are baselined before changing the persistent registry: a version alone cannot reconstruct previous membership.

## Keep the transaction boundary explicit

Atomicity belongs to each storage unit, not a plugin release spanning private files and several record groups. Preparation applies stores in order; a later failure can leave an earlier one upgraded. This matches the existing private-store model and is not a reason to invent a cross-store transaction. Do not design migrations that require simultaneous cross-store updates or replay live work. A complete recovery point protects the earlier application data.

## Evidence and disposition

The existing record-storage and built-in tool-history suites passed. Temporary probes confirmed expansion and removal at the same version. A separate probe confirmed the intended responsibility boundary: preparation enforces storage invariants, not the consuming contract’s content rules. The probes were removed after the run. No migration code or persisted format was changed.
