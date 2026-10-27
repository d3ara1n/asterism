import type { CardAppearance } from "@asterism/sdk/contracts";

/** Geometry declarations for built-in resources, shared by backend placement and frontend cards. */
export const agentCard = { width: 560, height: 640, minWidth: 480, minHeight: 480 } satisfies CardAppearance;
export const noteCard = { width: 340, height: 320, minWidth: 280, minHeight: 160 } satisfies CardAppearance;
export const directoryCard = { width: 340, height: 360, minWidth: 280, minHeight: 200 } satisfies CardAppearance;
export const manualCard = { width: 340, height: 160, minWidth: 280, minHeight: 120 } satisfies CardAppearance;
export const terminalCard = { width: 720, height: 440, minWidth: 360, minHeight: 220 } satisfies CardAppearance;
export const mcpCard = { width: 360, height: 300, minWidth: 280, minHeight: 160 } satisfies CardAppearance;
export const webCard = { width: 340, height: 300, minWidth: 260, minHeight: 160 } satisfies CardAppearance;
