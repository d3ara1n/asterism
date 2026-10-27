import type { UiMessage } from "@asterism-app/sdk/contracts";
import { MessageFormatter } from "../shared/i18n.ts";
import { hostCatalog } from "../shared/host-catalog.ts";
/** Startup failure prompts cannot depend on IPC, the task process, or the renderer; localization failure still displays default text. */
export function startupText(message: UiMessage, readLocale: () => string,
  createFormatter: (locale: string) => Pick<MessageFormatter, "text"> = locale => new MessageFormatter(locale, [hostCatalog])): string {
  try { return createFormatter(readLocale()).text(message); }
  catch (error) {
    console.error("Startup message could not be localized; the default message is used.", error);
    return message.defaultMessage;
  }
}
