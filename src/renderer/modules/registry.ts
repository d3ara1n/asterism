import { createElement } from "react";
import { Box } from "lucide-react";
import { t } from "../shared/i18n";
import { pluginOf, contractKey, type ContractReference, type Presentation } from "@atelier/sdk/contracts";
import type { CardRenderer, CardView, ResourceDescription, RendererModule, ToolRenderProps, ToolRenderer, ToolView } from "@atelier/sdk/renderer";
export * from "@atelier/sdk/renderer";

function index<T extends { contract: ContractReference }>(entries: readonly T[]): ReadonlyMap<string, T> {
  const map = new Map<string, T>();
  for (const entry of entries) {
    const key = contractKey(entry.contract);
    if (map.has(key)) throw new Error(`Duplicate renderer contract: ${key}`);
    map.set(key, entry);
  }
  return map;
}
export class ViewRegistry {
  private readonly resources = new Map<string, ResourceDescription>();
  private readonly cards: ReadonlyMap<string, CardRenderer>;
  private readonly tools: ReadonlyMap<string, ToolRenderer>;
  constructor(modules: readonly RendererModule[]) {
    for (const resource of modules.flatMap(module => module.resources)) {
      if (this.resources.has(resource.kind)) throw new Error(`Duplicate resource description: ${resource.kind}`);
      this.resources.set(resource.kind, resource);
    }
    this.cards = index(modules.flatMap(module => module.cards));
    this.tools = index(modules.flatMap(module => module.tools));
  }
  resource(kind: string): ResourceDescription {
    const plugin = pluginOf(kind);
    return this.resources.get(kind) ?? { kind, label: plugin ? t.kindMissing(plugin) : t.kindResource, icon: createElement(Box, { className: "size-4" }) };
  }
  card(presentation: Presentation): CardView | null {
    return this.cards.get(contractKey(presentation.contract))?.resolve(presentation.data) ?? null;
  }
  tool(contract: ContractReference | undefined, props: ToolRenderProps): ToolView | null {
    return contract ? this.tools.get(contractKey(contract))?.resolve(props) ?? null : null;
  }
}
