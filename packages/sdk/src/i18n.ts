import { z } from "zod";

export interface SourceMessage {
  readonly id: string;
  readonly defaultMessage: string;
  readonly description?: string;
}

export type MessageValues = Readonly<Record<string, string | number | boolean>>;

export interface UiMessage extends SourceMessage {
  readonly kind: "message";
  readonly owner: string;
  readonly sourceLocale: string;
  readonly values?: MessageValues;
}

export type UiText = string | UiMessage;

export const localeSchema = z.string().transform((value, context) => {
  try {
    return Intl.getCanonicalLocales(value)[0]!;
  } catch {
    context.addIssue({ code: "custom", message: "Invalid language tag." });
    return z.NEVER;
  }
});

export const messageValuesSchema = z.record(z.string(), z.union([z.string(), z.number().finite(), z.boolean()]));
export const uiMessageSchema = z.strictObject({
  kind: z.literal("message"),
  owner: z.string().min(1),
  sourceLocale: localeSchema,
  id: z.string().min(1),
  defaultMessage: z.string().refine(value => !!value.trim(), "A default message is required."),
  description: z.string().optional(),
  values: messageValuesSchema.optional(),
});
export const uiTextSchema = z.union([z.string(), uiMessageSchema]);

/** Standard static descriptor shape for extraction by the official FormatJS tooling. */
export function defineMessages<const T extends Record<string, SourceMessage>>(messages: T): T {
  return messages;
}

export function bindMessages<T extends Record<string, SourceMessage>>(
  owner: string,
  sourceLocale: string,
  definitions: T,
): { readonly [K in keyof T]: UiMessage } {
  const locale = localeSchema.parse(sourceLocale);
  const entries = Object.entries(definitions).map(([key, value]) => [
    key,
    Object.freeze(uiMessageSchema.parse({ ...value, kind: "message", owner, sourceLocale: locale })),
  ]);
  return Object.fromEntries(entries) as { readonly [K in keyof T]: UiMessage };
}

export function withValues(message: UiMessage, values: MessageValues): UiMessage {
  return uiMessageSchema.parse({ ...message, values: { ...message.values, ...values } });
}
