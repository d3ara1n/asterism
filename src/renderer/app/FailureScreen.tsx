import { useState, type ReactNode } from "react";
import { Button } from "@atelier/ui/ui/button";
import { startupMessages } from "../../shared/error-display";
import { useI18n } from "../shared/i18n";

export interface FailureAction {
  label: string;
  /** 返回字符串表示操作失败的说明，就地显示。 */
  run(): Promise<string | void> | string | void;
}

/**
 * 致命状态共用布局：启动失败与渲染崩溃都直接位于窗口材质上，保留窗口拖动。
 * 首个操作为主操作并取得焦点，其余为辅助操作；诊断详情默认折叠，可复制。
 */
export function FailureScreen({ title, body, actions, details, children }: {
  title: string; body: string; actions: readonly FailureAction[]; details: string;
  /** 操作与详情之间的补充内容，例如数据恢复点列表。 */
  children?: ReactNode;
}) {
  const i18n = useI18n();
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const run = async (action: FailureAction["run"]) => {
    if (busy) return;
    setBusy(true); setActionError(null);
    try { setActionError(await action() || null); }
    catch (error) { setActionError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const copy = () => run(async () => { await navigator.clipboard.writeText(details); setCopied(true); });
  return <main className="startup-screen">
    <section className="startup-content space-y-4" role="alert">
      <h1 className="type-page text-foreground">{title}</h1>
      <p className="type-body">{body}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {actions.map((action, index) => <Button key={action.label} variant={index === 0 ? "default" : "outline"}
          autoFocus={index === 0} disabled={busy} onClick={() => { void run(action.run); }}>{action.label}</Button>)}
      </div>
      {children}
      <details className="text-left">
        <summary>{i18n.text(startupMessages.details)}</summary>
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words select-text type-caption">{details}</pre>
        <Button className="mt-2" variant="outline" size="sm" disabled={busy} onClick={() => { void copy(); }}>
          {i18n.text(copied ? startupMessages.copiedDetails : startupMessages.copyDetails)}
        </Button>
      </details>
      {actionError && <p className="type-caption text-destructive">{actionError}</p>}
    </section>
  </main>;
}
