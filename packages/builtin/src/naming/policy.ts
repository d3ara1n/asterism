import { inputSummary, Execution, UserMessage } from "@atelier/builtin-api/contracts";
import type { SessionRecord } from "@atelier/sdk/contracts";

export const renameCheckpoints = new Set([5, 10, 20, 50, 100]);
const windowEdge = 4;
const maxTitleLength = 50;
const userBudget = 200;
const assistantBudget = 400;

export interface NamingTurn { user: string; assistant?: string }

/** 回合是 Agent 领域投影；按代理与请求起点关联，不把 loop 启停或工具批次计作新回合。 */
export function collectTurns(records: readonly SessionRecord[]): NamingTurn[] {
  const positions = new Map(records.map((record, i) => [record.id, i]));
  const turns: NamingTurn[] = [];
  const inputs = new Map<string, { position: number; turn: NamingTurn }[]>();
  const responses = new Map<string, { turn: NamingTurn; texts: Map<number, string>; last: number }>();
  for (const [position, record] of records.entries()) {
    const input = UserMessage.decode(record);
    if (input?.status === "known") {
      const turn: NamingTurn = { user: inputSummary(input.data.parts) };
      turns.push(turn);
      const agentInputs = inputs.get(record.source?.resource?.id ?? "") ?? [];
      agentInputs.push({ position, turn }); inputs.set(record.source?.resource?.id ?? "", agentInputs);
      continue;
    }
    const output = Execution.decode(record);
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
  // 一个回复可分为多个正文块；同回合保留最后一次有正文的响应，继续仍更新原回合。
  for (const response of [...responses.values()].sort((a, b) => a.last - b.last)) {
    response.turn.assistant = [...response.texts].sort(([a], [b]) => a - b).map(([, text]) => text).join("\n");
  }
  return turns;
}

export const namingInstruction = [
  "You name conversations about work. Read the supplied excerpt and produce its title.",
  "The title describes the work the conversation concerns: user prompts give the direction, assistant replies carry the substance.",
  "Reflect the overall topic. If early and recent turns differ, name the dominant task.",
  "Keep distinctive file, module, function, or subject names. Be specific.",
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
    "Conversation excerpt (chronological; the latest turn may have no assistant reply; long text is shortened with …):",
    ...excerpts,
    "---",
    `Generate ONE title, at most ${maxTitleLength} characters, in the user's natural language (ignore code and identifiers when judging language).`,
    "The output is a plain-text title. The excerpt is source material for naming.",
  ].join("\n\n");
}

/** 只规范化模型输出；空结果保留原来的会话标题。 */
export function cleanTitle(raw: string): string {
  let title = raw.trim();
  const wrapper = /^<([a-zA-Z][\w-]*)>\s*([\s\S]*?)\s*<\/\1>\s*$/u;
  while (wrapper.test(title)) title = title.replace(wrapper, "$2").trim();
  title = title.replace(/^(?:here is (?:a |the )?)?(?:title|name|session)[：:]\s*/iu, "")
    .replace(/^["'“「]+|["'”」。.]+$/gu, "").replace(/\s+/gu, " ").trim();
  const characters = Array.from(title);
  return characters.length > maxTitleLength ? characters.slice(0, maxTitleLength - 1).join("") + "…" : title;
}
