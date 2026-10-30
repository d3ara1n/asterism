import { pluginOf, withValues, type ContractReference, type Presentation, type SessionRecord, type UiText } from "@asterism-app/sdk/contracts";
import type { RecordRenderer, RecordRenderContext, RecordView, CardRenderer, CardView, CreationEntry, ResourceDescription, RendererModule, RendererObjectContext, ToolRenderProps, ToolRenderer, ToolView } from "@asterism-app/sdk/renderer";
import { Box } from "lucide-react";
import { createElement } from "react";

import { objectsMessages } from "../messages/objects";

function index<T extends { contract: ContractReference }>(entries: readonly T[]): ReadonlyMap<string, T> {
  const map = new Map<string, T>();
  for (const entry of entries) {
    const key = entry.contract.id;
    if (map.has(key)) throw new Error(`Duplicate renderer contract: ${key}`);
    map.set(key, entry);
  }
  return map;
}
export class ViewRegistry {
  private readonly resources = new Map<string, ResourceDescription>();
  private readonly cards: ReadonlyMap<string, CardRenderer>;
  private readonly tools: ReadonlyMap<string, ToolRenderer>;
  private readonly records: ReadonlyMap<string, RecordRenderer>;
  /** Index creation entries separately and retain assembly order for menus and drag-and-drop arbitration. */
  readonly creations: readonly CreationEntry[];
  constructor(modules: readonly RendererModule[]) {
    for (const resource of modules.flatMap(module => module.resources)) {
      if (this.resources.has(resource.kind)) throw new Error(`Duplicate resource description: ${resource.kind}`);
      this.resources.set(resource.kind, resource);
    }
    this.cards = index(modules.flatMap(module => module.cards));
    this.tools = index(modules.flatMap(module => module.tools));
    this.records = index(modules.flatMap(module => module.records ?? []));
    const creations = modules.flatMap(module => module.creations ?? []);
    const ids = new Set<string>();
    for (const entry of creations) {
      if (!pluginOf(entry.id)) throw new Error(`Creation entry needs a namespaced ID: ${entry.id}`);
      if (ids.has(entry.id)) throw new Error(`Duplicate creation entry: ${entry.id}`);
      ids.add(entry.id);
    }
    this.creations = creations;
  }
  resource(kind: string): ResourceDescription {
    const plugin = pluginOf(kind);
    return this.resources.get(kind) ?? { kind, label: plugin ? withValues(objectsMessages.kindMissing, { plugin }) : objectsMessages.kindResource, icon: createElement(Box, { className: "size-4" }) };
  }
  resourceDescriptions(): readonly ResourceDescription[] { return [...this.resources.values()]; }
  creation(id: string): CreationEntry | undefined {
    return this.creations.find(entry => entry.id === id);
  }
  card(presentation: Presentation, context?: RendererObjectContext): CardView | null {
    return this.cards.get(presentation.contract.id)?.resolve(presentation.data, context) ?? null;
  }
  /** Return null for unregistered contracts or decoding failure so the host displays an unknown record; errors from individual views are also treated as unknown. */
  record(record: SessionRecord, context: RecordRenderContext): RecordView | null {
    try { return this.records.get(record.contract.id)?.resolve(record, context) ?? null; }
    catch (error) { console.error(`Record view ${record.contract.id} failed.`, error); return null; }
  }
  tool(contract: ContractReference | undefined, props: ToolRenderProps): ToolView | null {
    return contract ? this.tools.get(contract.id)?.resolve(props) ?? null : null;
  }
  /** Display name declared by the tool view registered for an implementation contract. */
  toolLabel(contract: string): UiText | undefined {
    return this.tools.get(contract)?.label;
  }
}
