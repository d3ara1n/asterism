import type { WebContents } from "electron";

/** 浏览器权限只向当前受信页面的主框架开放；剪贴板写入不赋予读取权限。 */
export function allowRendererPermission({ permission, isMainFrame, contents, mainContents, trustedURL }: {
  permission: string;
  isMainFrame: boolean;
  contents: Pick<WebContents, "getURL"> | null;
  mainContents: Pick<WebContents, "getURL"> | null | undefined;
  trustedURL: string | null;
}): boolean {
  return (permission === "local-fonts" || permission === "clipboard-sanitized-write")
    && isMainFrame && !!contents && contents === mainContents && !!trustedURL
    && contents.getURL().split("#")[0] === trustedURL;
}
