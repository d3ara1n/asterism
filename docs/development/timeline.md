# Timeline and history

Each session owns a record tree with fixed identity and ancestry and one execution cursor. The host stores generic records and workbench events; plugins interpret their own domain records. Completed records are immutable. An explicitly pending operation can fill its result once at its original position.

## Record identity and provenance

Nodes have stable IDs and parent IDs. The logical beginning is `null`, not a stored root node. Every append uses the cursor at commit time as its parent and advances that cursor atomically.

A record contains its contract identity, payload, and host-stamped source. Plugin writes identify the writing plugin and an optional validated emitting resource. A null source identifies host records. Associated objects belong in the record payload and need not be the emitting resource.

The built-in Agent owns input messages, model output blocks, and summaries. The host does not interpret requests, turns, thinking blocks, naming sources, or provider continuations.

Host resource creation, title changes, removal, and link changes have public SDK record contracts shared by host processing and plugin observation. Typed decoding preserves unreadable matching records rather than treating them as absent. The host emits these facts through resource operations; exposing their contracts does not grant plugins write ownership.

## Commit complete facts

Session writes use synchronous transactions with a single writer. A commit does not await models, filesystems, or transport. Nested host operations share the enclosing transaction.

Inputs commit before model execution. Batched inputs remain separate records, including ordered text and file parts.

Streaming deltas stay in memory. Text and thinking commit after model generation ends. Before executing a successful response's tool batch, the Agent publishes the complete tool inputs in model order as pending operations. Each outcome fills its original operation once, preserving the input and historical position independently of execution completion order.

The response's highest-ordinal actual block owns its termination metadata, including generation success, failure or cancellation, reported usage, timing, and domain extensions. Other blocks carry no duplicate termination. Tool outcomes do not change the model generation outcome. Empty responses create no invented history block; their errors remain transient feedback.

Concurrent agents append at processing time. Completed records remain unchanged; pending tool operations fill only their result.

## Publish operations before completion

An operation that must be discoverable while running publishes its input immediately. Its pending record fixes the submission identity, source, time, and parent. Completion stores the output in that same record without advancing the cursor or creating a second historical position. The host validates the declaring plugin and contract; an object writer also retains its original emitting identity.

Completion can occur while another branch is selected. Every path containing the original operation sees its result on subsequent reads. A path before that operation does not contain it. Completion does not replay execution or restore resources.

Snapshot handles retain their original observations, including operations that were pending at capture time. Their pending bodies are captured separately so completed history can remain lazily read. A new snapshot observes the latest completion.

Record metadata and record bodies have separate reading lifetimes. Metadata preserves the complete tree, stable session order, and source identity. Queries first select a scope and positional interval, then apply contract, source, and identity filters before selecting a page. Range anchors belong to the unfiltered scope. Loading a body later does not change the snapshot's path, upper bound, or pending observation.

Input and result content roots belong to the same record. Saving the result and retaining its attachments share one transaction; rollback preserves the pending record and publishes no completion. Completion adds result dependencies without revoking input dependencies.

Publication and completion have distinct notifications. Observers receive a completed record as an update, and views replace its body by ID at the existing position. Completion cannot rewrite a finalized record. Plugins can complete their own pending records during resource cleanup through the session writer without requiring that resource to remain on the current path.

## Preserve partial output

Cancelled or interrupted generation can save incomplete blocks. They advance the cursor and remain visible in history. Agent model projection excludes unfinished text, thinking, and tool arguments while retaining usable completed content from the same response. Complete tool arguments without an outcome project with an explicit explanation: a call never handed to execution is reported as not executed, and a call handed to execution without a recorded result is reported as having unknown effects. Projection does not execute the call or rewrite history.

A tool that started execution obtains an outcome. Confirmed cancellation differs from an unknown write effect. Neither outcome implies rollback.

Generation errors with output remain in response termination metadata and produce a historical notice. Errors without output remain transient feedback. Neither is synthetic assistant output. Preserve reported metadata when available and leave missing usage unknown. A process crash does not trigger automatic replay.

## Select a path

A timeline is the complete ancestor path from the logical beginning to a selected node. Its endpoint may have descendants.

Moving the cursor changes the active path without creating a node. If `A → B → C` exists, moving to B and appending D produces `A → B → D`, while C remains. Merely selecting B does not create a branch.

A branch is the UI organization of a continuation. It adds no persistent branch object or separate session. A cursor on a shared prefix need not belong uniquely to one leaf.

Explicit cursor changes write a separate selection log in the same transaction as the cursor update. This log is outside the record tree and model context. Ordinary appends express advancement through their parent relationships.

## Reconstruct and project

The host reconstructs resource presence, titles, and links by replaying workbench events along the selected path. Display, object operations, and the next request’s access share that result. Reconstruction failure must not retain old authorization as a fallback.

Presence notifications compare resource identity sets after commit. They do not replay external operations or append new creation/removal events.

Views read current layout and current domain data separately. Agent UI displays recorded output in historical order. Agent model projection can group responses, filter incomplete output, and substitute summaries.

Each Agent response records the path endpoint captured when its request began. That request parent differs from the actual append parent. Model projection groups response blocks and tool outcomes at the captured request position, then places intervening visible events after the complete response. Their relative order remains intact.

Context projection may reorganize model input without changing recorded history. Trailing thinking exposed by interruption or rewind is removed at assistant boundaries, including before subsequent user input. Conversation shells share these participation rules: dashed outlines identify content that does not fully participate, and error color identifies content left unfinished by a failed request. A tool's own execution failure is an outcome reported by the tool view, not a request failure. The original content and plugin renderers remain available for inspection.

## Coordinate cursor changes

Moving the cursor requires all timeline-dependent work in the session to have settled. An external resource’s continued existence alone does not make it busy.

History-panel selection is local UI state. The workbench and agents continue to reflect the execution cursor until an explicit continue action succeeds.

The host permits any historical node as a cursor target. Each execution plugin decides how to project a protocol-valid context from that path. The host does not snap to an Agent response boundary.

Cursor movement reconstructs recorded relationships, not external reality. It does not restore files, undo tools, isolate shared mutable resources, or guarantee identical model output. Historical immutable content remains retained by its original records.
