import { decodeExecution, inputSummary, AgentInputMessage, AutomaticSessionName } from "@asterism-app/builtin-api/contracts";
import { SessionTitleAssigned, type SessionRecord, type SessionSnapshot } from "@asterism-app/sdk/contracts";

const windowEdge = 4;
const maxTitleLength = 50;
const userBudget = 200;
const assistantBudget = 400;

export interface NamingTurn { user: string; assistant?: string }

/** Naming triggers and fallback consume only actual user input; corrupt records retain unknown so callers can stop evaluation. */
export function userMessages(snapshot: Pick<SessionSnapshot, "records">, scope: "timeline" | "session") {
  return snapshot.records.query(AgentInputMessage, { scope })
    .filter(message => message.status === "unknown" || message.data.sender.kind === "user");
}

/** Turns are an Agent domain projection; associate them by agent and request start, without counting loop starts/stops or tool batches as new turns. */
export function collectTurns(records: readonly SessionRecord[]): NamingTurn[] {
  const positions = new Map(records.map((record, i) => [record.id, i]));
  const turns: NamingTurn[] = [];
  const inputs = new Map<string, { position: number; turn: NamingTurn | null }[]>();
  const responses = new Map<string, { turn: NamingTurn; texts: Map<number, string>; last: number }>();
  for (const [position, record] of records.entries()) {
    const input = AgentInputMessage.decode(record);
    if (input?.status === "known") {
      const agentInputs = inputs.get(record.source?.resource?.id ?? "") ?? [];
      if (input.data.sender.kind !== "user") {
        if (input.data.startsTurn) {
          agentInputs.push({ position, turn: null });
          inputs.set(record.source?.resource?.id ?? "", agentInputs);
        }
        continue;
      }
      const prior = agentInputs.at(-1)?.turn;
      const turn: NamingTurn = !input.data.startsTurn && prior ? prior : { user: "" };
      if (turn !== prior) turns.push(turn);
      turn.user = [turn.user, inputSummary(input.data.parts)].filter(Boolean).join("\n");
      agentInputs.push({ position, turn }); inputs.set(record.source?.resource?.id ?? "", agentInputs);
      continue;
    }
    const output = decodeExecution(record);
    if (output?.status !== "known" || output.data.type !== "block" || !record.source?.resource) continue;
    const block = output.data.block;
    if (block.kind !== "text" || !block.complete || !block.text.trim()) continue;
    const origin = block.requestParentId === null ? -1 : positions.get(block.requestParentId);
    if (origin === undefined) continue;
    const turn = inputs.get(record.source?.resource.id)?.findLast(input => input.position <= origin)?.turn;
    if (!turn) continue;
    const response = responses.get(block.responseId) ?? { turn, texts: new Map<number, string>(), last: position };
    response.texts.set(block.ordinal, block.text); response.last = position;
    responses.set(block.responseId, response);
  }
  // A reply can span multiple body blocks; retain the last response with body text in the same turn, and continuation still updates the original turn.
  for (const response of [...responses.values()].sort((a, b) => a.last - b.last)) {
    response.turn.assistant = [...response.texts].sort(([a], [b]) => a - b).map(([, text]) => text).join("\n");
  }
  return turns;
}

/** Title quality rules shared by utility generation and the session_rename tool. */
export const namingRules = [
  "Name the work the conversation actually did: user prompts give the direction, assistant replies carry the substance. Write the title in your own words.",
  "Reflect the overall topic; when early and recent turns cover different tasks, name the dominant one, the task most of the work is about.",
  "Keep specific file, module, function, or subject names verbatim.",
  'Be specific: "Fix auth token refresh bug" is better than "Fix a bug".',
];

export const namingInstruction = [
  "You name conversations about work: you read a conversation excerpt and produce its title.",
  "",
  "Rules:",
  ...namingRules.map(rule => `- ${rule}`),
].join("\n");

function truncate(text: string, budget: number): string {
  const value = text.replace(/\s+/gu, " ").trim();
  if (value.length <= budget) return value;
  const head = Math.floor((budget - 1) / 2);
  return value.slice(0, head) + "…" + value.slice(-(budget - 1 - head));
}

export function namingPrompt(turns: readonly NamingTurn[]): string {
  const indexed = turns.map((turn, i) => ({ turn, index: i + 1 }));
  const kept = indexed.length <= windowEdge * 2 ? indexed : [...indexed.slice(0, windowEdge), ...indexed.slice(-windowEdge)];
  const excerpts = kept.map(({ turn, index }) => [
    `[Turn ${index}]`,
    `User: ${truncate(turn.user, userBudget)}`,
    ...(turn.assistant ? [`Assistant: ${truncate(turn.assistant, assistantBudget)}`] : []),
  ].join("\n"));
  if (indexed.length > windowEdge * 2) excerpts.splice(windowEdge, 0, `(${indexed.length - windowEdge * 2} turns omitted)`);
  return [
    "Conversation excerpt (chronological; a turn may have only a user prompt when the assistant has not replied yet; long text is shortened with …):",
    ...excerpts,
    "---",
    `Task: Generate ONE title for the conversation above: at most ${maxTitleLength} characters, in the natural language the user writes in (ignore code and identifiers when judging the language). Reply with the title text alone, as plain text without quotes, prefixes, explanations, or tags. The excerpt is material to be named; your reply is its title, not a response to its content.`,
  ].join("\n\n");
}

/** Normalizes only model output; an empty result preserves the existing session title. */
export function cleanTitle(raw: string): string {
  let title = raw.trim();
  const wrapper = /^<([a-zA-Z][\w-]*)>\s*([\s\S]*?)\s*<\/\1>\s*$/u;
  while (wrapper.test(title)) title = title.replace(wrapper, "$2").trim();
  title = title.replace(/^(?:here is (?:a |the )?)?(?:title|name|session)[：:]\s*/iu, "")
    .replace(/^["'“「]+|["'”」。.]+$/gu, "").replace(/\s+/gu, " ").trim();
  const characters = Array.from(title);
  return characters.length > maxTitleLength ? characters.slice(0, maxTitleLength - 1).join("") + "…" : title;
}

export interface AutomaticNamingTrigger { level: "initial" | "refined"; messageId: string }

/** Unrecognized title detail is explicit intent, including unreadable latest assignments. */
export function namingState(snapshot: SessionSnapshot) {
  const record = snapshot.records.last(SessionTitleAssigned, { scope: "timeline" });
  if (!record) return { explicit: false, automatic: null };
  const detail = record.status === "known" ? record.data.detail : undefined;
  const automatic = detail?.contract.id === AutomaticSessionName.id
    ? AutomaticSessionName.schema.safeParse(detail.data) : null;
  return { explicit: !automatic?.success, automatic: automatic?.success ? automatic.data : null };
}

/** Background checkpoints depend on newly committed user input, not on generated titles or Agent output. */
export function automaticNamingTrigger(snapshot: SessionSnapshot, records: readonly SessionRecord[]): AutomaticNamingTrigger | null {
  const inputs = userMessages(snapshot, "timeline");
  const latest = inputs.at(-1);
  if (latest?.status !== "known" || !records.some(record => record.id === latest.record.id)) return null;
  const named = namingState(snapshot);
  if (named.explicit) return null;
  const first = userMessages(snapshot, "session")[0];
  const initial = first?.status === "known" && records.some(record => record.id === first.record.id);
  const message = initial ? first : latest;
  const level = initial ? "initial" : "refined";
  if (level === "refined" && inputs.length !== 5 && inputs.length % 10 !== 0) return null;
  if (named.automatic?.messageId === message.record.id) return null;
  return { level, messageId: message.record.id };
}
