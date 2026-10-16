import { FieldSet, FieldGroup } from "@atelier/ui/ui/field";

import { DialogFooter } from "@atelier/ui/ui/dialog";
import { Button } from "@atelier/ui/ui/button";
import { Spinner } from "@atelier/ui/ui/spinner";
import { useRef, useState, type ReactNode } from "react";

import { commonMessages } from "@atelier/ui/messages/common";
import { useI18n } from "@atelier/sdk/renderer";

/**
 * 内置创建视图共用的表单与提交门禁；外壳（标题、错误、关闭）由宿主创建协调器提供。
 * 提交中仍可取消：取消会中止宿主的创建准备。
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
