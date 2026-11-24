# Review: live and snapshot execution indicators

A running status in a tool result can be a historical observation. Motion should represent a view that is still following ongoing work, not a state name in a saved result.

## Agent card title

`698d9317` (`feat(agent): show execution time and phase on the composer edge`, 2026-11-22, Git author Dearain, co-author `claude-opus-5-5`) adds `still` to the title's `StatusBadge` in `packages/builtin/src/agent/conversation/Conversation.tsx:46`. The parent used the same badge and tone without `still`. Shared `StatusIcon` converts the live progress tone to `Spinner` and honors reduced motion; `still` selects the fixed icon. `25d316c0` changes the phase indicator to the transcript orb and composer edge light without restoring the title spinner. The current design-system paragraph explicitly preserves a static title, despite the title being fed by the live Agent card projection. Restore the shared spinner by removing the local override. Retain the body-to-composer handoff; the title and body serve different reading positions. Replace the static-title rule with the live-versus-snapshot distinction rather than documenting the change history in the design system.

## Subagent surfaces

- The pool list is invalidated by the runtime as tasks change (`packages/builtin/src/subagents/runtime.ts:76–95`); the list and connected detail use the live `TaskStatus` badge (`PoolCard.tsx:115,221`). Running spins; queued or terminal states do not.
- The detail pane retains its last frame when `PoolChannel` closes (`PoolCard.tsx:58–76`). It still renders a live badge, activity rows, and a locally advancing elapsed clock if the last frame was running (`PoolCard.tsx:29–35,115,150–160`; `ActivityTail.tsx:14–15,41–44`; `task-parts.tsx:36–46`). This is a stale snapshot, not confirmation of ongoing work. Stop those live affordances until a new frame arrives, without changing the recorded task status or the reconnect action.
- `subagent_wait` publishes updates until the selected tasks end (`service.ts:148–171`); the conversation tool shell spins while the tool itself is executing, and the wait body shows live task statuses and activity while waiting (`tool-views.tsx:101–118`). The successful result lists terminal tasks; cancellation returns no task data and does not cancel the tasks (`runtime.ts:27–34,123–128`). No incorrect motion in the settled path was found.
- `subagent_check` and the pool-list tool use the static `TaskStateText` and `TaskStateIcon`, respectively (`tool-views.tsx:59–81,167–176`; `task-parts.tsx:19–33`). Their `running` state describes the sampled moment. The brief spinner of the generic tool shell during the lookup is about the lookup itself, not its result.

Validated against source and Git history. The 18 focused subagent and tool-state tests passed; animations and disconnect handling were not tested in the GUI. No implementation changes were made.

## Disposition

Keep the last task frame when its detail subscription closes. A closed channel means updates stopped, not that the task state changed. Leave task indicators based on the last received frame and use the separate connection message to explain why updates stopped. The recommendation to switch the detail pane to static indicators is withdrawn. The Agent title uses the shared live progress spinner again. The wait and one-time tool views remain unchanged.
