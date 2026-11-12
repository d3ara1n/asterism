# Design a session starting point

A session contains a history tree and a workbench. Its starting point can be an empty workspace or a set of resources prepared for a task. An Agent and an initial message are domain choices, not prerequisites for starting work.

## Own the starting experience

A session entry owns the draft, validation feedback, submission state, and initial title for its workflow. The host owns opening the resulting session and the surrounding entry selection.

Choose initial resources that make the submitted work useful. A research entry might create a workspace around a source document; a conversation entry might create an Agent and accept input. Keep the entry's purpose visible rather than asking users to configure unrelated host mechanisms.

## Separate preparation from commitment

Preparation can perform asynchronous validation and acquire what initialization needs. The final synchronous commit establishes the session and its initial facts together. A rejected submission should not leave an apparently valid but empty piece of work behind.

Use the original resource creation and action contracts when initial work has the same meaning as ordinary operations. This preserves their parsing and preparation rules instead of building a special first-use path that drifts from later use.

Observation after commitment is not a blocking initialization hook. If a resource must have state before use, make that state part of preparation and initialization rather than relying on an observer to catch up.

## Keep a submission's identity

Treat a retry as another attempt to learn the result of the same submission, not as new work. Retain its identity and draft until acceptance is known; give a genuinely new submission a new identity.

This distinction matters when a response fails after the session was created. The user should be able to recover the accepted work without silently creating a duplicate session.

Carry attachments through their content ownership boundary, separately from the business input. A content identifier alone is not access to bytes. Transfer ownership to durable state before releasing a temporary draft.

## Name the work, not the entry

Use the initial title to identify the work being started. Later naming policy may reflect its development, but belongs to the plugin or paradigm that understands that work. The host preserves title history without deciding what the work means.
