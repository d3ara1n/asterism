import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const modelCatalogMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
  fetch: { id: "modelCatalog.fetch", defaultMessage: "Fetch parameters" },
  fetching: { id: "modelCatalog.fetching", defaultMessage: "Fetching…" },
  hint: { id: "modelCatalog.hint", defaultMessage: "Fill in parameters and API reference prices from models.dev, replacing current form values. Review and save your changes." },
  lookupHint: { id: "modelCatalog.lookupHint", defaultMessage: "Match models.dev parameters using “{modelId}”, ignoring routing prefixes. The server model ID stays unchanged." },
  filled: { id: "modelCatalog.filled", defaultMessage: "Parameters filled in from models.dev ({source})." },
  unfilled: { id: "modelCatalog.unfilled", defaultMessage: "Unavailable or not directly supported: {fields}. These settings were kept; review them manually." },
  failed: { id: "modelCatalog.failed", defaultMessage: "Could not fetch parameters from models.dev. Your settings were kept. Try again or enter them manually." },
  timeout: { id: "modelCatalog.timeout", defaultMessage: "Fetching parameters timed out. Your settings were kept. Try again." },
  invalid: { id: "modelCatalog.invalid", defaultMessage: "models.dev returned invalid parameter data. Your settings were kept." },
  notFound: { id: "modelCatalog.notFound", defaultMessage: "No exact match for “{modelId}” was found on models.dev. Enter the parameters manually." },
  ambiguous: { id: "modelCatalog.ambiguous", defaultMessage: "Multiple models match “{modelId}” on models.dev. Enter the parameters manually." },
}));
