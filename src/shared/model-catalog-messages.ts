import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const modelCatalogMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
  fetch: { id: "modelCatalog.fetch", defaultMessage: "Fetch parameters" },
  fetching: { id: "modelCatalog.fetching", defaultMessage: "Fetching…" },
  fetchTitle: { id: "modelCatalog.fetchTitle", defaultMessage: "Replace form values with parameters and API reference prices from models.dev. Save to keep them." },
  lookupHint: { id: "modelCatalog.lookupHint", defaultMessage: "Matched on models.dev as {modelId}" },
  applied: { id: "modelCatalog.applied", defaultMessage: "Filled in" },
  missing: { id: "modelCatalog.missing", defaultMessage: "Not provided" },
  context: { id: "modelCatalog.context", defaultMessage: "{count} context" },
  output: { id: "modelCatalog.output", defaultMessage: "{count} output" },
  openWeights: { id: "modelCatalog.openWeights", defaultMessage: "Open weights" },
  released: { id: "modelCatalog.released", defaultMessage: "Released {date}" },
  pdf: { id: "modelCatalog.pdf", defaultMessage: "PDF" },
  failed: { id: "modelCatalog.failed", defaultMessage: "Could not reach models.dev. Try again." },
  timeout: { id: "modelCatalog.timeout", defaultMessage: "models.dev timed out. Try again." },
  invalid: { id: "modelCatalog.invalid", defaultMessage: "models.dev returned invalid data for this model." },
  notFound: { id: "modelCatalog.notFound", defaultMessage: "{modelId} is not on models.dev." },
  ambiguous: { id: "modelCatalog.ambiguous", defaultMessage: "{modelId} matches several models on models.dev." },
}));
