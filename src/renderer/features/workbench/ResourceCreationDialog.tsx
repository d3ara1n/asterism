import { useRef, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../shared/ui/dialog";
import { Alert, AlertDescription } from "../../shared/ui/alert";
import { Button } from "../../shared/ui/button";
import { FieldGroup, FieldSet } from "../../shared/ui/field";
import { Spinner } from "../../shared/ui/spinner";
import { t } from "../../shared/i18n";

export type ResourceCreationDialogState = {
  busy: boolean;
  error?: string | null;
  onRetry?: () => void;
  onClose: () => void;
};

/** 创建入口共用布局与提交门禁；字段校验由各资源表单提供。 */
export function ResourceCreationDialog({ title, description, busy, error, onRetry, onClose, disabled, validate, onCreate, children }: ResourceCreationDialogState & {
  title: string;
  description: string;
  disabled?: boolean;
  validate?: () => boolean;
  onCreate: () => Promise<boolean>;
  children: ReactNode;
}) {
  const pending = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const blocked = busy || submitting;
  return <Dialog open onOpenChange={open => { if (!open && !pending.current) onClose(); }}>
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto" showCloseButton={!submitting}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      {(error || submitError) && <Alert variant="destructive">
        <AlertDescription>
          <span>{error ?? submitError}</span>
          {onRetry && <Button type="button" variant="ghost" size="sm" onClick={onRetry}>{t.retry}</Button>}
        </AlertDescription>
      </Alert>}
      <form noValidate className="flex flex-col gap-5" onSubmit={async event => {
        event.preventDefault();
        if (blocked || disabled || pending.current) return;
        if (validate && !validate()) return;
        pending.current = true;
        setSubmitting(true);
        setSubmitError(null);
        try {
          if (await onCreate()) onClose();
        } catch {
          setSubmitError(t.resourceCreationFailed);
        } finally {
          pending.current = false;
          setSubmitting(false);
        }
      }}>
        <FieldSet disabled={blocked}>
          <FieldGroup>{children}</FieldGroup>
        </FieldSet>
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={submitting} onClick={onClose}>{t.cancel}</Button>
          <Button disabled={blocked || disabled} aria-busy={submitting}>
            {submitting && <Spinner aria-hidden="true" />}{submitting ? t.creating : t.create}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
