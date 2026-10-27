import { recordRenderer, useI18n, type RecordRenderer } from "@asterism/sdk/renderer";
import { Brain, MessageSquareText, User, Bot, Wrench, Info } from "lucide-react";

import { inputSummary, Execution, AgentInputMessage, ContextSummary } from "@asterism/builtin-api/contracts";
import { Badge } from "@asterism/ui/ui/badge";
import { conversationMessages } from "../messages/conversation";

/** History rows for agent records: styles distinguish user input, thinking, and output without relying on text prefixes. */
const RowText = ({ label, className }: { label: string; className?: string }) => <span className={`block truncate leading-5 ${className ?? ""}`}>{label}</span>;
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export const agentRecordViews: RecordRenderer[] = [
  recordRenderer(ContextSummary, {
    icon: <Info className="size-4" />,
    label: (data, context) => `${context.text(conversationMessages.contextSummary)} · ${data.summary}`,
  }),
  recordRenderer(AgentInputMessage, {
    icon: data => data.sender.kind === "agent" ? <Bot className="size-4" /> : <User className="size-4 text-primary-text" />,
    label: data => data.sender.kind === "agent" ? `${data.sender.name} · ${inputSummary(data.parts)}` : inputSummary(data.parts),
    Row: ({ label }) => <RowText label={label} className="font-medium" />,
  }),
  recordRenderer(Execution, {
    icon: data => data.block.kind === "thinking" ? <Brain className="size-4" />
      : data.block.kind === "toolcall" ? <Wrench className="size-4" /> : <MessageSquareText className="size-4" />,
    label: data => {
      const block = data.block;
      if (block.kind !== "toolcall") return block.kind === "thinking" ? block.text || block.summary : block.text;
      const args = record(block.arguments), target = record(args.target);
      const tool = block.name === "resource_call" && typeof args.tool === "string" ? args.tool : block.name;
      return typeof target.path === "string" ? `${tool} · ${target.path}` : tool;
    },
    Row: ({ data, label }) => {
      const i18n = useI18n();
      return <span className="flex min-w-0 items-center gap-2">
        <RowText label={label} className={data.block.kind === "thinking" ? "italic text-muted-foreground" : undefined} />
        {!data.block.complete && <Badge variant="outline">{i18n.formatMessage(conversationMessages.incomplete)}</Badge>}
      </span>;
    },
  }),
];
