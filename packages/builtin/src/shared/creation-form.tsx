import { FieldSet, FieldGroup } from "@asterism-app/ui/ui/field";

import { DialogFooter } from "@asterism-app/ui/ui/dialog";
import { Button } from "@asterism-app/ui/ui/button";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { useRef, useState, type ReactNode } from "react";

import { commonMessages } from "@asterism-app/ui/messages/common";
import { useI18n } from "@asterism-app/sdk/renderer";

/**
 * Form and submission gate shared by built-in creation views; the host creation coordinator provides the shell (title, error, close).
 * Cancellation remains available during submission and aborts the host's creation preparation.
 */
export function CreationForm({ busy, disabled, validate, onSubmit, onCancel, children }: {
  busy: boolean;
  disabled?: boolean;
  validate?: () => boolean;
  onSubmit: () => Promise<boolean>;
  onCancel: () => void;
  children: ReactNode;
}) {
  const i18n = useI18n();
  const pending = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const blocked = busy || submitting;
  return <form noValidate className="flex flex-col gap-5" onSubmit={async event => {
    event.preventDefault();
    if (blocked || disabled || pending.current) return;
    if (validate && !validate()) return;
    pending.current = true;
    setSubmitting(true);
    try { await onSubmit(); }
    finally { pending.current = false; setSubmitting(false); }
  }}>
    <FieldSet disabled={blocked}>
      <FieldGroup>{children}</FieldGroup>
    </FieldSet>
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onCancel}>{i18n.formatMessage(commonMessages.cancel)}</Button>
      <Button disabled={blocked || disabled} aria-busy={blocked}>
        {blocked && <Spinner aria-hidden="true" />}{blocked ? i18n.formatMessage(commonMessages.creating) : i18n.formatMessage(commonMessages.create)}
      </Button>
    </DialogFooter>
  </form>;
}
