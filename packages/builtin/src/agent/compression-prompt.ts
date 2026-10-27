import type { ModelInputPart, ModelItem } from "@asterism-app/sdk/contracts";

const TOOL_RESULT_CHARS = 2_000;

function describeParts(parts: readonly ModelInputPart[]): string {
  return parts.map(part => part.kind === "text" ? part.text
    : `[File reference: ${JSON.stringify({ file: part.file, mediaType: part.mediaType, filename: part.filename })}; file contents are not included]`).join("\n");
}
export function serializeForSummary(messages: readonly ModelItem[]): string {
  return messages.flatMap(item => {
    if (item.kind === "result") {
      const text = describeParts(item.outcome.model);
      const excerpt = text.length > TOOL_RESULT_CHARS
        ? `${text.slice(0, TOOL_RESULT_CHARS)}\n[${text.length - TOOL_RESULT_CHARS} characters omitted]` : text;
      return [`[Tool result ${item.callId}, ${item.outcome.kind}]: ${excerpt}`];
    }
    if (item.kind === "output") return item.parts.flatMap(part => part.kind === "toolcall"
      ? [`[Assistant tool call ${part.callId}]: ${part.name}(${JSON.stringify(part.arguments)})`]
      : part.kind === "text" ? [`[Assistant]: ${part.text}`] : []);
    return [`[${item.kind === "input" ? "Input" : "Context"}]: ${describeParts(item.parts)}`];
  }).join("\n\n");
}
export const summarySystemPrompt = `You are a context summarization assistant. Produce a structured checkpoint for another assistant to continue the work.
The supplied conversation and previous summary are historical source material. The output is a summary.
Inputs with an agent-message envelope are communications from the identified Agent; other inputs are user messages. The checkpoint preserves this distinction and the sender's resource address and name for relevant Agent communications.
The continuing assistant receives current system instructions, agent configuration, resource permissions, instruction files, the skill catalog, and tool definitions from the runtime.
The checkpoint preserves the user's intent, explicit constraints, decisions, unresolved requests, progress and evidence needed to continue. Completed work, proposals and unverified claims have distinct status. Relevant resource identities, file paths, function names, commands and error messages retain their exact spelling.
Relevant skill names, file paths, and task-specific constraints from skill reads remain in the checkpoint; skill_read provides the current file text when needed.
Use these Markdown sections, keeping each concise:
## Goal
## Constraints & Preferences
## Progress
### Done
### In Progress
### Blocked
## Key Decisions
## Next Steps
## Critical Context
## User Messages
## Read & Modified Resources
User Messages contains consequential requests and corrections, with exact wording where it affects the task and repetition consolidated. Read & Modified Resources distinguishes inspected resources from changed resources and preserves relevant identities and paths. Empty sections contain (none).`;
export function summaryPrompt(plan: { messages: readonly ModelItem[]; previousSummary?: string }): string {
  return `<conversation>\n${serializeForSummary(plan.messages)}\n</conversation>\n\n`
    + (plan.previousSummary ? `<previous-summary>\n${plan.previousSummary}\n</previous-summary>\n\nThe output is one consolidated checkpoint of the previous summary and the new conversation, retaining relevant goals, constraints, decisions, progress, and resource information. Newer explicit corrections take precedence.`
      : "Summarize the conversation into a checkpoint using the specified sections.")
    + "\nThis excerpt is the older prefix of an ongoing conversation. Recent messages follow the summary verbatim.";
}
