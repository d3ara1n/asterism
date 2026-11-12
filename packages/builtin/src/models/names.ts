import { ModelCatalog, modelReference } from "@asterism-app/sdk/contracts";
import { useRendererCatalogs } from "@asterism-app/sdk/renderer";

/** Display names come from the current configuration; results keep their recorded identifiers, which remain the fallback once an entry is gone. */
export function useModelNames() {
  const catalog = useRendererCatalogs().get(ModelCatalog);
  return {
    provider: (id: string) => catalog?.modelProviders.find(provider => provider.id === id)?.name ?? id,
    model: (expression: string) => catalog?.models.find(model => modelReference(model) === expression)?.name ?? null,
  };
}
