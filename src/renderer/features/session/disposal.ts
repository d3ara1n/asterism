import { useEffect, useState } from "react";
import type { UiText } from "@asterism/sdk/contracts";
import { runtime } from "../../runtime";

export type DisposalWarning = { objectId: string; title: string; warning: UiText };

/** 确认框打开时向后台读取结束提示；提示反映实例当前状态，不随投影推送。ids 为 null 表示未打开，"all" 取会话全部对象。 */
export function useDisposalWarnings(sessionId: string, ids: readonly string[] | "all" | null): readonly DisposalWarning[] {
  const [warnings, setWarnings] = useState<readonly DisposalWarning[]>([]);
  const key = ids === "all" ? "\0all" : ids ? ids.join("\n") : null;
  useEffect(() => {
    setWarnings([]);
    if (key === null || !key) return;
    let active = true;
    void runtime.session.execute({ type: "disposal.warnings", sessionId, ...(key === "\0all" ? {} : { objectIds: key.split("\n") }) }).then(result => {
      if (active && result.ok && result.reply.kind === "warnings") setWarnings(result.reply.warnings);
    });
    return () => { active = false; };
  }, [sessionId, key]);
  return warnings;
}
