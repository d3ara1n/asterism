import { defineMessages, pluginNamespace } from "@asterism/sdk/contracts";

export const modelCatalogMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
  fetch: { id: "modelCatalog.fetch", defaultMessage: "Fetch parameters" },
  fetching: { id: "modelCatalog.fetching", defaultMessage: "Fetching…" },
  hint: { id: "modelCatalog.hint", defaultMessage: "Fetch parameters and API reference prices from models.dev and overwrite current values. You can edit them afterwards." },
  saved: { id: "modelCatalog.saved", defaultMessage: "Parameters saved from models.dev ({source})." },
  unfilled: { id: "modelCatalog.unfilled", defaultMessage: "Unavailable or not directly supported: {fields}. These settings were kept; review them manually." },
  failed: { id: "modelCatalog.failed", defaultMessage: "Could not fetch parameters from models.dev. Your settings were kept. Try again or enter them manually." },
  timeout: { id: "modelCatalog.timeout", defaultMessage: "Fetching parameters timed out. Your settings were kept. Try again." },
  invalid: { id: "modelCatalog.invalid", defaultMessage: "models.dev returned invalid parameter data. Your settings were kept." },
  notFound: { id: "modelCatalog.notFound", defaultMessage: "No exact model match was found on models.dev. Enter the parameters manually." },
  ambiguous: { id: "modelCatalog.ambiguous", defaultMessage: "Multiple models match this ID on models.dev. Enter the parameters manually." },
  saveFirst: { id: "modelCatalog.saveFirst", defaultMessage: "Save your changes before fetching parameters." },
}));
