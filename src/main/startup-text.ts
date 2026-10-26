import type { UiMessage } from "@asterism/sdk/contracts";
import { MessageFormatter } from "../shared/i18n.ts";
import { hostCatalog } from "../shared/host-catalog.ts";
/** 启动失败提示不能依赖 IPC、任务进程或 renderer；本地化失败仍展示默认正文。 */
export function startupText(message: UiMessage, readLocale: () => string,
  createFormatter: (locale: string) => Pick<MessageFormatter, "text"> = locale => new MessageFormatter(locale, [hostCatalog])): string {
  try { return createFormatter(readLocale()).text(message); }
  catch (error) {
    console.error("Startup message could not be localized; the default message is used.", error);
    return message.defaultMessage;
  }
}
