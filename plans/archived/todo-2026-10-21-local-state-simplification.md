# Local state simplification

Filed on 2026-10-21. Implementation completed.

Local writes took effect in backend processing order, and reads used their current returned value. The work removed runtime entity revisions, read generations, precommit identity/content rechecks, and stale-result rejection used as a substitute for entry pending and cancellation.

Fixed storage, IPC, and API versions remained software-format identities. Product rules such as busy-resource removal, action reentry, duplicate declarations, and already-ended questions were outside the cleanup.

Configuration, credentials, model discovery, parameter lookup, account usage, creation preparation, window state, filesystem writes, and naming adopted the same principle. File operations retained initial root checks, text validation, and atomic replacement.

Cross-boundary validation was reviewed without introducing a generic validation framework. Tests dedicated only to removed mechanisms and their error wording were deleted.

Typechecks, affected tests, build, and localization passed; the user accepted GUI behavior. Development data was not cleaned as part of this task. The recorded submission and file-error details describe that stage and are not independent current contracts.
