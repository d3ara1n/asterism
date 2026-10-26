# Session naming

The built-in naming module interprets Agent inputs and naming records. Generic session services expose queries, commits, and title updates without knowing Agent turn semantics.

## Triggers and material

Automatic naming checks new user-message commits. Agent messages, assistant replies, tools, stop, and continuation do not trigger it.

Initial naming uses the session’s first user input. Refined naming uses selected later user-message checkpoints on the current path.

Material captures the triggering snapshot and associates inputs and completed assistant bodies by agent and request. It excludes thinking, tool payloads, incomplete bodies, and sibling branches.

Naming uses the utility role. An unavailable utility model leaves the existing title and does not fall back to the conversation model. Requests do not block the Agent.

## Events and current title

Every successful naming operation appends `SessionNamed` with user, agent, or automatic origin. Automatic entries also identify the trigger and actual model.

Explicit user or Agent naming protects the current path from automatic updates. The latest unknown naming record also prevents speculative fallback. Protection on one branch does not extend to a sibling branch that lacks that record.

Cursor-change observation derives the title from the latest naming record on the current path. Without one, eligible first-user-input material supplies the initial fallback. Unreadable or absent material preserves the current title.

Title synchronization updates the derived current title without appending another naming event. Saving an explicitly chosen identical title still records the naming intent.

## Invocation and failure

The application calls the naming module’s bound public domain interface for user rename. The model-facing read and rename tools use their bound session context; rename does not invoke another model.

The naming task captures material at its trigger. At commit, it verifies that the triggering input still belongs to the current path and that no explicit or unknown latest naming record blocks automatic naming. Otherwise, results append in completion order.

Failed, cancelled, empty, or truncated generation appends no naming event. Reopening does not replay old attempts. A future checkpoint can try again.

Naming records stay outside Agent model input.
