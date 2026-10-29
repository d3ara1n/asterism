# Session naming

A session represents the time and space of the user's work: its history and workbench. Session identity and titles belong to the host independently of any Agent conversation. The ownership rules here define the boundary between generic title operations and paradigm-specific naming behavior.

## Title ownership

The entry that assembles a session supplies its initial title. Generic session services own title reads, updates, and user rename without depending on a paradigm's naming API or interpreting its records. Session titles remain usable when builtin is disabled.

Automatic naming belongs to the paradigm that defines its trigger, material, and model selection. The host needs no automatic-naming strategy registry. A plugin uses generic session capabilities to apply a generated title.

## Builtin triggers and material

Builtin's automatic naming policy uses the beginning of an Agent turn as its trigger. The policy decides whether the turn qualifies for initial naming or a later refinement; it does not require a model call for every turn. Tool execution, assistant replies, stop, and continuation are not independent naming triggers.

Initial automatic naming uses the first eligible user input. Refinement uses selected later user-message checkpoints on the current path. This generated title is separate from the initial title supplied during session assembly.

Material captures the triggering snapshot and associates inputs and completed assistant bodies by Agent and request. It excludes thinking, tool payloads, incomplete bodies, and sibling branches.

Naming uses builtin's utility role. An unavailable utility model leaves the existing title and does not fall back to the conversation model. Naming requests do not block the Agent.

## Explicit names and history

Explicit user or Agent naming protects the current path from builtin's automatic updates. Saving an explicitly chosen identical title still expresses naming intent. Protection on one branch does not extend to a sibling branch that lacks that intent.

Every title assignment appends a host record. The host restores the latest assignment on the selected path, or the entry's initial title when that path has none. Selecting a position does not manufacture another naming action.

Automatic assignments carry typed builtin detail containing trigger material and model provenance. Builtin interprets that detail for its policy. An assignment with no recognized automatic detail protects the path from automatic replacement. The host preserves plugin detail without interpreting it.

## Invocation and failure

User rename uses generic host title operations. Model-facing read and rename tools use the session capabilities available to their plugin; rename does not invoke another model.

A builtin naming task captures material at its trigger. At commit, its policy checks that the triggering input still belongs to the current path and that explicit naming or unknown latest naming material does not block the automatic update. Otherwise, results append in completion order.

Failed, cancelled, empty, or truncated generation appends no naming event. Reopening does not replay old attempts. A future eligible turn can try again. Title records and their naming detail stay outside Agent model input.
