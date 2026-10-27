import { useId } from "react";
import { Info } from "lucide-react";
import { useI18n } from "@asterism-app/sdk/renderer";
import { Button } from "@asterism-app/ui/ui/button";
import { Badge } from "@asterism-app/ui/ui/badge";
import { Checkbox } from "@asterism-app/ui/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@asterism-app/ui/ui/radio-group";
import { Textarea } from "@asterism-app/ui/ui/textarea";
import { InputGroup, InputGroupTextarea } from "@asterism-app/ui/ui/input-group";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet, FieldTitle } from "@asterism-app/ui/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@asterism-app/ui/ui/popover";
import { Markdown } from "../agent/conversation/Markdown";
import { questionMessages as messages } from "../messages/questions";
import type { Question } from "./contract";
import type { AnswerDraft } from "./drafts";

/** Option details are read in a popover; its trigger is inside the option label and stops propagation so clicking does not change selection. */
function OptionDetail({ label, detail }: { label: string; detail: string }) {
  const i18n = useI18n();
  return <Popover>
    <PopoverTrigger asChild>
      <Button type="button" variant="ghost" size="icon-xs" className="-my-1 text-muted-foreground"
        aria-label={i18n.formatMessage(messages.detail, { option: label })} onClick={event => event.stopPropagation()}>
        <Info />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" collisionPadding={8} aria-label={label}
      className="w-[min(28rem,calc(100vw-2rem))] max-h-[min(24rem,60dvh)] space-y-2 overflow-y-auto">
      <p className="type-label break-words">{label}</p>
      <Markdown>{detail}</Markdown>
    </PopoverContent>
  </Popover>;
}

export function QuestionFields({ question, value, update, invalid }: {
  question: Question; value: AnswerDraft; update(value: AnswerDraft): void; invalid: boolean;
}) {
  const i18n = useI18n();
  const id = useId();
  const patch = (next: Partial<AnswerDraft>) => update({ ...value, skipped: false, ...next });
  const options = question.type === "text" ? null : <div className="space-y-2">
    {question.options.map((option, index) => <div key={option.id}>
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
              {option.detail && <OptionDetail label={option.label} detail={option.detail} />}
            </FieldTitle>
            {option.description && <FieldDescription id={`${id}-description-${index}`}>{option.description}</FieldDescription>}
            {question.recommendation?.optionId === option.id && <FieldDescription>{question.recommendation.reason}</FieldDescription>}
          </FieldContent>
        </Field>
      </FieldLabel>
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
                // Arrow keys used while editing text move the caret instead of triggering radio-group keyboard navigation.
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
      <div className="min-w-0 space-y-3">
        {choiceFields}
        {question.type === "text" && <Field>
          <FieldLabel htmlFor={`${id}-text`}>{i18n.text(messages.text)}</FieldLabel>
          <Textarea id={`${id}-text`} value={value.text} rows={3} aria-invalid={invalid}
            aria-describedby={invalid ? `${id}-error` : undefined} onChange={event => patch({ text: event.target.value })} />
        </Field>}
      </div>
      {invalid && <FieldError id={`${id}-error`}>{i18n.text(messages.invalid)}</FieldError>}
    </>}
  </FieldSet>;
}
