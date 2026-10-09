import { nanoid } from "nanoid";

/** 资源身份是供存储和工具调用引用的稳定句柄；对用户描述资源时使用标题。 */
export function createResourceId(): string {
  return nanoid(16);
}
