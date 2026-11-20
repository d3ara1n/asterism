import { createContext } from "react";

/** Static documents retain Markdown rendering without navigation or editing controls. */
export const MarkdownDocumentContext = createContext(false);
export const MarkdownStreamingContext = createContext(false);
