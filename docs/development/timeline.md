# Timeline and history

Each session owns an immutable record tree and one execution cursor. The host stores generic records and workbench events; plugins interpret their own domain records.

## Record identity and provenance

Nodes have stable IDs and parent IDs. The logical beginning is `null`, not a stored root node. Every append uses the cursor at commit time as its parent and advances that cursor atomically.

A record contains its contract identity, payload, and host-stamped source. Plugin writes identify the writing plugin and an optional validated emitting resource. A null source identifies host records. Associated objects belong in the record payload and need not be the emitting resource.

The built-in Agent owns input messages, model output blocks, and summaries. The host does not interpret requests, turns, thinking blocks, naming sources, or provider continuations.

## Commit complete facts

Session writes use synchronous transactions with a single writer. A commit does not await models, filesystems, or transport. Nested host operations share the enclosing transaction.

Inputs commit before model execution. Batched inputs remain separate records, including ordered text and file parts.

Streaming deltas stay in memory. An Agent output block commits once its final data is known: text and thinking await response termination; a tool call also awaits its outcome.

The response’s highest-ordinal actual block owns its completion metadata, including reported usage, timing, and domain extensions. Other blocks carry no duplicate completion. There is no later patch, separate completion node, or invented node for an empty response.

Concurrent agents append in actual completion order. Historical nodes remain unchanged after commit.

## Preserve partial output

Cancelled or interrupted generation can save incomplete blocks. They advance the cursor and remain visible in history. Agent model projection excludes incomplete blocks.

A tool that started execution obtains an outcome. Confirmed cancellation differs from an unknown write effect. Neither outcome implies rollback.

Execution diagnostics and error details are transient feedback, not synthetic assistant output. Preserve reported metadata when available and leave missing usage unknown. A process crash does not trigger automatic replay.

## Select a path

A timeline is the complete ancestor path from the logical beginning to a selected node. Its endpoint may have descendants.

Moving the cursor changes the active path without creating a node. If `A → B → C` exists, moving to B and appending D produces `A → B → D`, while C remains. Merely selecting B does not create a branch.

A branch is the UI organization of a continuation. It adds no persistent branch object or separate session. A cursor on a shared prefix need not belong uniquely to one leaf.

Explicit cursor changes write a separate selection log in the same transaction as the cursor update. This log is outside the record tree and model context. Ordinary appends express advancement through their parent relationships.

## Reconstruct and project

The host reconstructs resource presence and links by replaying workbench events along the selected path. Display, object operations, and the next request’s access share that result. Reconstruction failure must not retain old authorization as a fallback.

Presence notifications compare resource identity sets after commit. They do not replay external operations or append new creation/removal events.

Views read current layout and current domain data separately. Agent UI displays recorded output in historical order. Agent model projection can group responses, filter incomplete output, and substitute summaries.

Each Agent response records the path endpoint captured when its request began. That request parent differs from the actual append parent. Model projection groups response blocks and tool outcomes at the captured request position, then places intervening visible events after the complete response. Their relative order remains intact.

Context projection may reorganize model input without changing recorded history.

## Coordinate cursor changes

Moving the cursor requires all timeline-dependent work in the session to have settled. An external resource’s continued existence alone does not make it busy.

History-panel selection is local UI state. The workbench and agents continue to reflect the execution cursor until an explicit continue action succeeds.

The host permits any historical node as a cursor target. Each execution plugin decides how to project a protocol-valid context from that path. The host does not snap to an Agent response boundary.

Cursor movement reconstructs recorded relationships, not external reality. It does not restore files, undo tools, isolate shared mutable resources, or guarantee identical model output. Historical immutable content remains retained by its original records.
