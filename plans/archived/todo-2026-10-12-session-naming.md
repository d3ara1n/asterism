# Initial automatic naming

Filed on 2026-10-12. Code and documentation completed. This record describes the original naming implementation, before later event and cursor semantics changed.

User-message submission triggered initial and later refined naming through the utility model. Assistant output and continuation supplied material without triggering naming. Material associated each agent's inputs and completed replies, excluding thinking, tool payloads, incomplete text, and sibling branches.

The first design used separate naming-attempt records, session-wide source precedence, and checks against newer results. It also added fixed-snapshot first/last queries and preserved unknown latest records. Those historical mechanisms should not be read as current interfaces.

An unavailable utility model caused no fallback to the conversation model. Failed or empty output retained the current title, and reopening did not automatically redo attempts.

Typechecks, tests, and build passed with isolated databases and synthetic streams. Cases covered query scope, rollback, same-title intent, branch behavior, material association, failures, and model-context exclusion. Real endpoint and GUI checks remained separate.
