import { withValues, type ProviderSetting, type UsageProviderInfo } from "@asterism-app/sdk/contracts";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { canEditModelProviderField, modelOAuthProviderNames, type ModelProviderInput } from "../../../shared/configuration";
import { providersMessages as messages } from "../../messages/providers";
import { modelProtocolLabels } from "./protocols";

/** All model connections share these fields; presets supply values and editing rules. */
export function modelProviderFields(provider: Omit<ModelProviderInput, "enabled">, usageProviders: readonly UsageProviderInfo[], keyUrl?: string): ProviderSetting[] {
  const fields: ProviderSetting[] = [
    { kind: "text", key: "name", label: messages.displayName, required: true },
    { kind: "text", key: "id", label: messages.providerId, description: messages.providerIdHint, required: true },
  ];
  if (canEditModelProviderField(provider, "protocol")) fields.push({
    kind: "choice", key: "protocol", label: messages.protocol, default: provider.protocol,
    options: Object.entries(modelProtocolLabels).map(([value, label]) => ({ value, label })),
  });
  if (canEditModelProviderField(provider, "baseUrl")) fields.push({
    kind: "text", key: "baseUrl", label: commonMessages.baseUrl, required: true,
    description: provider.auth !== "none" ? messages.httpsRequired : undefined,
  });
  if (canEditModelProviderField(provider, "auth")) fields.push({
    kind: "choice", key: "auth", label: messages.authentication, default: provider.auth,
    options: [{ value: "api_key", label: commonMessages.apiKey }, { value: "oauth", label: messages.oauth }, { value: "none", label: messages.noAuthenticationOption }],
  });
  // A single OAuth implementation needs no choice; the draft already names it.
  if (provider.auth === "oauth" && canEditModelProviderField(provider, "oauthProvider") && Object.keys(modelOAuthProviderNames).length > 1) fields.push({
    kind: "choice", key: "oauthProvider", label: messages.oauthProvider, default: provider.oauthProvider ?? "chatgpt",
    options: Object.entries(modelOAuthProviderNames).map(([value, label]) => ({ value, label })),
  });
  if (provider.auth === "api_key") fields.push({
    kind: "secret", key: "apiKey", label: commonMessages.apiKey, required: true, helpUrl: keyUrl,
  });
  if (canEditModelProviderField(provider, "usage")) fields.push({
    kind: "choice", key: "usage", label: messages.usage, default: "off",
    options: [
      { value: "off", label: messages.usageOff },
      ...usageProviders.map(provider => ({ value: `usage:${provider.id}`, label: provider.label })),
      ...(provider.usage && !usageProviders.some(item => item.id === provider.usage)
        ? [{ value: `usage:${provider.usage}`, label: withValues(messages.usageMissing, { id: provider.usage }) }] : []),
    ],
  });
  return fields;
}
