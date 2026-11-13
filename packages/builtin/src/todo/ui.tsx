import { useRef, useState } from "react";
import { useI18n, useRendererObject } from "@asterism-app/sdk/renderer";
import type { UiText } from "@asterism-app/sdk/contracts";
import type { z } from "zod";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { failureDisplay } from "@asterism-app/ui/error-display";
import { todoMessages as messages } from "../messages/todo";
import { MutateTodo } from "./contract";

export function todoFailure(error: unknown): UiText {
  return failureDisplay(error, messages.failed);
}
export function TodoError({ error }: { error: UiText | null }) {
  const i18n = useI18n();
  return error ? <Alert variant="destructive"><AlertDescription>{i18n.text(error)}</AlertDescription></Alert> : null;
}
/** Each mounted entry gates only its own submission. */
export function useTodoMutation() {
  const object = useRendererObject();
  const gate = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<UiText | null>(null);
  const run = async (input: z.input<typeof MutateTodo.schema>) => {
    if (gate.current) return false;
    gate.current = true; setPending(true); setError(null);
    try {
      const result = await object.invoke(MutateTodo, input);
      if (!result.ok) { setError(todoFailure(result.error)); return false; }
      return true;
    } catch (failure) { setError(todoFailure(failure)); return false; }
    finally { gate.current = false; setPending(false); }
  };
  return { run, pending, error };
}
