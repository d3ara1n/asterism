import { useId } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useI18n } from "@atelier/sdk/renderer";
import { Button } from "@atelier/ui/ui/button";
import { Badge } from "@atelier/ui/ui/badge";
import { Checkbox } from "@atelier/ui/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@atelier/ui/ui/radio-group";
import { Textarea } from "@atelier/ui/ui/textarea";
import { InputGroup, InputGroupTextarea } from "@atelier/ui/ui/input-group";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet, FieldTitle } from "@atelier/ui/ui/field";
import { Markdown } from "../agent/conversation/Markdown";
import { questionMessages as messages } from "../messages/questions";
import type { Question } from "./contract";
import type { AnswerDraft } from "./drafts";

export function QuestionFields({ question, value, update, detail, setDetail, invalid }: {
  question: Question; value: AnswerDraft; update(value: AnswerDraft): void;
  detail: string | null; setDetail(id: string | null): void; invalid: boolean;
}) {
  const i18n = useI18n();
  const id = useId();
  const patch = (next: Partial<AnswerDraft>) => update({ ...value, skipped: false, ...next });
  const optionDetail = question.type === "text" ? undefined : question.options.find(option => option.id === detail);
  const options = question.type === "text" ? null : <div className="space-y-2">
    {question.options.map((option, index) => <div key={option.id} className="space-y-1">
      <FieldLabel htmlFor={`${id}-${index}`} className="w-full">
        <Field orientation="horizontal">
          {question.type === "single"
            ? <RadioGroupItem id={`${id}-${index}`} value={`option:${option.id}`} aria-describedby={option.description ? `${id}-description-${index}` : undefined} />
            : <Checkbox id={`${id}-${index}`} checked={value.selected.includes(option.id)} aria-invalid={invalid}
              aria-describedby={[option.description ? `${id}-description-${index}` : "", invalid ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined}
              onCheckedChange={checked => patch({ selected: checked === true ? [...value.selected, option.id] : value.selected.filter(item => item !== option.id) })} />}
          <FieldContent>
            <FieldTitle className="flex-wrap break-words">{option.label}
              {question.recommendation?.optionId === option.id && <Badge variant="secondary">{i18n.text(messages.recommended)}</Badge>}
            </FieldTitle>
            {option.description && <FieldDescription id={`${id}-description-${index}`}>{option.description}</FieldDescription>}
            {question.recommendation?.optionId === option.id && <FieldDescription>{question.recommendation.reason}</FieldDescription>}
          </FieldContent>
        </Field>
      </FieldLabel>
      {option.detail && <Button type="button" variant="ghost" size="xs" aria-expanded={detail === option.id}
        aria-controls={detail === option.id ? `${id}-detail-inline ${id}-detail-wide` : undefined} onClick={() => setDetail(detail === option.id ? null : option.id)}>
        {detail === option.id ? <ChevronUp /> : <ChevronDown />}{i18n.text(detail === option.id ? messages.closeDetail : messages.detail)}
        <span className="sr-only"> · {option.label}</span>
      </Button>}
      {detail === option.id && option.detail && <div className="px-3 py-2 @3xl/questions:hidden" id={`${id}-detail-inline`}>
        <Markdown>{option.detail}</Markdown>
      </div>}
    </div>)}
    <FieldLabel asChild className="w-full">
      <InputGroup className="h-auto">
        <Field orientation="horizontal">
          {question.type === "single"
            ? <RadioGroupItem id={`${id}-custom-choice`} value="custom" aria-label={i18n.text(messages.custom)}
              aria-invalid={invalid && value.custom} aria-describedby={invalid && value.custom ? `${id}-error` : undefined} />
            : <Checkbox id={`${id}-custom-choice`} checked={value.custom} aria-label={i18n.text(messages.custom)}
              aria-invalid={invalid && value.custom} aria-describedby={invalid && value.custom ? `${id}-error` : undefined}
              onCheckedChange={checked => patch({ custom: checked === true })} />}
          <FieldContent>
            <InputGroupTextarea rows={1} className="min-h-0 p-0 text-sm font-medium leading-snug" value={value.text}
              aria-label={i18n.text(messages.custom)} placeholder={i18n.text(messages.customPlaceholder)}
              aria-invalid={invalid && value.custom} aria-describedby={invalid && value.custom ? `${id}-error` : undefined}
              onChange={event => patch({ text: event.target.value })}
              onKeyDown={event => {
                // 编辑文字的方向键留给光标，不触发单选组的键盘导航。
                if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) event.stopPropagation();
              }} />
          </FieldContent>
        </Field>
      </InputGroup>
    </FieldLabel>
  </div>;
  const choiceFields = question.type === "single" ? <RadioGroup
    aria-labelledby={`${id}-title`} aria-describedby={invalid ? `${id}-error` : undefined} aria-invalid={invalid}
    value={value.custom ? "custom" : value.selected[0] ? `option:${value.selected[0]}` : ""}
    onValueChange={selected => patch(selected === "custom" ? { custom: true } : { custom: false, selected: [selected.slice(7)] })}>
    {options}
  </RadioGroup> : options;
  return <FieldSet className="min-w-0 gap-3">
    <FieldLegend id={`${id}-title`} className="mb-0 type-section break-words">{question.question}</FieldLegend>
    <p className="type-caption text-muted-foreground">{i18n.text(messages[question.type])} · {i18n.text(question.required ? messages.required : messages.optional)}</p>
    {question.context && <Markdown>{question.context}</Markdown>}
    {value.skipped ? <div className="space-y-2">
      <p className="type-body text-muted-foreground">{i18n.text(messages.skipped)}</p>
      <Button type="button" variant="outline" size="sm" onClick={() => patch({ skipped: false })}>{i18n.text(messages.resume)}</Button>
    </div> : <>
      <div className={optionDetail?.detail ? "grid min-w-0 gap-4 @3xl/questions:grid-cols-2" : "min-w-0"}>
        <div className="min-w-0 space-y-3">
          {choiceFields}
          {question.type === "text" && <Field>
            <FieldLabel htmlFor={`${id}-text`}>{i18n.text(messages.text)}</FieldLabel>
            <Textarea id={`${id}-text`} value={value.text} rows={3} aria-invalid={invalid}
              aria-describedby={invalid ? `${id}-error` : undefined} onChange={event => patch({ text: event.target.value })} />
          </Field>}
        </div>
        {optionDetail?.detail && <aside id={`${id}-detail-wide`} className="hidden min-w-0 space-y-3 border-l pl-4 @3xl/questions:block" aria-label={optionDetail.label}>
          <p className="type-label">{optionDetail.label}</p><Markdown>{optionDetail.detail}</Markdown>
        </aside>}
      </div>
      {invalid && <FieldError id={`${id}-error`}>{i18n.text(messages.invalid)}</FieldError>}
    </>}
  </FieldSet>;
}
