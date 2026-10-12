import type { Provider } from "./configuration.ts";
import { contentReadLimit } from "./content.ts";

/** 三协议已接通的文件编码类型；模型声明仍须显式允许对应类型。 */
export const inputMediaTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"] as const;
/** 原始字节总量为协议封装和 base64 留出余量。 */
export const modelInputLimits = { image: 5 * 1024 * 1024, file: contentReadLimit, files: 20, total: 20 * 1024 * 1024 } as const;
export function supportedInputMediaTypes(_protocol: Provider["protocol"]): readonly string[] { return inputMediaTypes; }
