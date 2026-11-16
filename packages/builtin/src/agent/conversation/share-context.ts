import { createContext } from "react";

export const ConversationShareContext = createContext<((anchor: string, origin: HTMLElement) => void) | null>(null);
