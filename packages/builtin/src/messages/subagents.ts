import { defineMessages } from "@asterism-app/sdk/contracts";
import { builtin } from "@asterism-app/builtin-api/contracts";

export const subagentMessages = builtin.messages("en", defineMessages({
  title: { id: "subagent.title", defaultMessage: "Subagent Pool" },
  empty: { id: "subagent.empty", defaultMessage: "Link this pool to an Agent to delegate tasks. Link resources to the pool to make them available to its subagents." },
  state: { id: "subagent.state", defaultMessage: "{state, select, queued {Queued} running {Running} succeeded {Completed} partial {Partial} failed {Failed} cancelled {Cancelled} other {Unknown}}" },
  active: { id: "subagent.active", defaultMessage: "{running} running · {queued} queued" },
  runningWarning: { id: "subagent.runningWarning", defaultMessage: "This pool has unfinished tasks. Closing it cancels them and saves their available results." },
  delegate: { id: "subagent.delegate", defaultMessage: "Delegate task" },
  wait: { id: "subagent.wait", defaultMessage: "Wait for tasks" },
  check: { id: "subagent.check", defaultMessage: "Read task" },
  cancel: { id: "subagent.cancel", defaultMessage: "Cancel task" },
  steer: { id: "subagent.steer", defaultMessage: "Add instructions" },
  task: { id: "subagent.task", defaultMessage: "Task" },
  background: { id: "subagent.background", defaultMessage: "Background" },
  report: { id: "subagent.report", defaultMessage: "Report" },
  process: { id: "subagent.process", defaultMessage: "Live process" },
  back: { id: "subagent.back", defaultMessage: "Back to tasks" },
  noReport: { id: "subagent.noReport", defaultMessage: "No report is available yet." },
  instructions: { id: "subagent.instructions", defaultMessage: "Additional instructions" },
  delivered: { id: "subagent.delivered", defaultMessage: "Instructions queued." },
  unavailable: { id: "subagent.unavailable", defaultMessage: "This task is unavailable on the current timeline." },
  disconnected: { id: "subagent.disconnected", defaultMessage: "The task view disconnected. Close and reopen it to reconnect." },
  usage: { id: "subagent.usage", defaultMessage: "{requests} requests · {seconds}s" },
  activity: { id: "subagent.activity", defaultMessage: "{activity, select, starting {Starting} thinking {Thinking} text {Writing} finalizing {Saving result} tool {Using {tool}} other {Working}}" },
  timeBudget: { id: "subagent.timeBudget", defaultMessage: "Subagent time budget (seconds)" },
  requestBudgetHint: { id: "subagent.requestBudgetHint", defaultMessage: "An unset request limit leaves subagents bounded by their time budget." },
}));
