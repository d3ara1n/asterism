import { z } from "zod";
import { localeSchema } from "@atelier/sdk/contracts";
import { coreChannel } from "./core.ts";
export const languageGetChannel = coreChannel("language.get");
export const languageSetChannel = coreChannel("language.set");
export const languageChangedChannel = coreChannel("language.changed");
export const languagePreferenceSchema = z.union([z.literal("system"), localeSchema]);
export const languageStateSchema = z.strictObject({ preference: languagePreferenceSchema, locale: localeSchema, interfaceLocale: localeSchema });
export type LanguageState = z.infer<typeof languageStateSchema>;
export interface LanguageBridge {
  get(): Promise<LanguageState>;
  set(preference: string): Promise<LanguageState>;
  onChanged(listener: (state: LanguageState) => void): () => void;
}
export const translationCatalogSchema = z.strictObject({ owner: z.string().min(1), locale: localeSchema,
  revision: z.string().min(1), messages: z.record(z.string(), z.string()) });
