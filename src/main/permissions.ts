import type { WebContents } from "electron";

/** Browser permissions are available only to the current trusted page's main frame; clipboard write grants no read access. */
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
