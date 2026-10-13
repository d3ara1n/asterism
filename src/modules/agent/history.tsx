import { recordRenderer, type RecordRenderer } from "@atelier/sdk/renderer";
import { Brain, MessageSquareText, User, Wrench, TriangleAlert, Info } from "lucide-react";

import { inputSummary } from "../../shared/model-input";
import { recordMessages } from "../messages/records";
import { Execution, UserMessage, Notice } from "./records";

/** 代理记录的历史行：以样式区分用户、思考与输出，不依赖文字前缀。 */
const RowText = ({ label, className }: { label: string; className?: string }) => <span className={`block truncate leading-5 ${className ?? ""}`}>{label}</span>;
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export const agentRecordViews: RecordRenderer[] = [
  recordRenderer(UserMessage, {
    icon: <User className="size-4 text-primary" />,
    label: data => inputSummary(data.parts),
    Row: ({ label }) => <RowText label={label} className="font-medium" />,
  }),
  recordRenderer(Execution, {
    icon: data => data.type !== "block" ? <TriangleAlert className="size-4" />
      : data.block.kind === "thinking" ? <Brain className="size-4" />
      : data.block.kind === "toolcall" ? <Wrench className="size-4" /> : <MessageSquareText className="size-4" />,
    label: data => {
      if (data.type === "diagnostic") return data.message;
      if (data.type === "completion") return recordMessages.recordModelResponse;
      const block = data.block;
      if (block.kind !== "toolcall") return block.text;
      const args = record(block.arguments), target = record(args.target);
      const tool = block.name === "resource_call" && typeof args.tool === "string" ? args.tool : block.name;
      return typeof target.path === "string" ? `${tool} · ${target.path}` : tool;
    },
    Row: ({ data, label }) => <RowText label={label}
      className={data.type === "block" && data.block.kind === "thinking" ? "italic text-muted-foreground" : undefined} />,
  }),
  recordRenderer(Notice, {
    icon: data => data.level === "info" ? <Info className="size-4" /> : <TriangleAlert className="size-4" />,
    label: data => data.message,
  }),
];
