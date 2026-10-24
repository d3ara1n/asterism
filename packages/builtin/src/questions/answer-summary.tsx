import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { useI18n } from "@atelier/sdk/renderer";
import { Badge } from "@atelier/ui/ui/badge";
import { Separator } from "@atelier/ui/ui/separator";
import { StatusText } from "@atelier/ui/ui/status";
import { questionMessages as messages } from "../messages/questions";
import type { SummaryRow } from "./summary";

/** 复核页与终结结果共用的只读回执；作答界面提交后原位变为同一结构。 */
export function AnswerSummary({ rows, message, action }: {
  rows: SummaryRow[]; message?: string; action?(index: number): ReactNode;
}) {
  const i18n = useI18n();
  return <div className="space-y-3">
    {rows.map((row, index) => <div key={row.id} className="space-y-3">
      {index > 0 && <Separator />}
      <div className="space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <p className="type-label min-w-0 break-words">{rows.length > 1 && `${index + 1}. `}{row.question}</p>
          {action?.(index)}
        </div>
        {row.status === "skipped" ? <StatusText tone="neutral">{i18n.text(messages.skipped)}</StatusText>
          : row.status === "pending" ? <StatusText tone="warning">{i18n.text(messages.pending)}</StatusText>
          : <div className="space-y-1 type-body">
            {row.selected.map(option => <p key={option.id} className="flex items-start gap-1.5 break-words">
              <Check aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-success" />
              <span className="min-w-0">{option.label}</span>
              {option.recommended && <Badge variant="secondary">{i18n.text(messages.recommended)}</Badge>}
            </p>)}
            {row.text && (row.type === "text"
              ? <p className="whitespace-pre-wrap break-words">{row.text}</p>
              : <div className="flex items-start gap-1.5">
                <Check aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-success" />
                <div className="min-w-0 space-y-0.5">
                  <p className="type-caption text-muted-foreground">{i18n.text(messages.custom)}</p>
                  <p className="whitespace-pre-wrap break-words">{row.text}</p>
                </div>
              </div>)}
            {row.comment && <p className="whitespace-pre-wrap break-words text-muted-foreground">{row.comment}</p>}
          </div>}
        {row.status === "answered" && row.others.length > 0 && <p className="type-caption break-words text-muted-foreground">
          {i18n.text(messages.notChosen)}: {row.others.map((option, index) => <span key={option.id}>
            {index > 0 && " · "}{option.label}{option.recommended && ` (${i18n.text(messages.recommended)})`}
          </span>)}
        </p>}
      </div>
    </div>)}
    {message && <>
      <Separator />
      <div className="space-y-1 type-body">
        <p className="type-label">{i18n.text(messages.message)}</p>
        <p className="whitespace-pre-wrap break-words">{message}</p>
      </div>
    </>}
  </div>;
}
