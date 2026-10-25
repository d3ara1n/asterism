import type { CardAppearance } from "@atelier/sdk/contracts";

/** 内置资源的几何声明，后台放置与前端卡片共用。 */
export const agentCard = { width: 560, height: 640, minWidth: 480, minHeight: 480 } satisfies CardAppearance;
export const noteCard = { width: 340, height: 320, minWidth: 280, minHeight: 160 } satisfies CardAppearance;
export const directoryCard = { width: 340, height: 360, minWidth: 280, minHeight: 200 } satisfies CardAppearance;
export const terminalCard = { width: 720, height: 440, minWidth: 360, minHeight: 220 } satisfies CardAppearance;
export const mcpCard = { width: 360, height: 300, minWidth: 280, minHeight: 160 } satisfies CardAppearance;
export const webCard = { width: 340, height: 300, minWidth: 260, minHeight: 160 } satisfies CardAppearance;
