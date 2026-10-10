import { createElement, type ComponentType, type ReactNode } from "react";
import { Box } from "lucide-react";
import { t } from "../shared/i18n";
import type { Json } from "../../shared/json.ts";
import { contractKey, reference, type ContractReference, type DataContract, type Presentation } from "../../shared/presentation.ts";

/** 类型级静态识别信息，不解析卡片数据，也不创建正文组件。 */
export interface ResourceDescription {
  kind: string;
  label: string;
  icon: ReactNode;
}
export interface CardAppearance {
  width: number;
  height?: number;
}
export interface CardView extends CardAppearance {
  body: ReactNode;
  actions?: ReactNode;
}
export interface CardRenderer {
  contract: ContractReference;
  resolve(data: Json): CardView | null;
}
export interface ResultRenderer {
  contract: ContractReference;
  resolve(data: Json): ReactNode;
}
export interface RendererModule {
  resources: ResourceDescription[];
  cards: CardRenderer[];
  results: ResultRenderer[];
}

/** 类型擦除只发生在注册边界；组件接收到的是已通过契约校验的数据。 */
export function cardRenderer<T extends Json>(
  contract: DataContract<T>,
  definition: CardAppearance & { Body: ComponentType<{ data: T }>; Actions?: ComponentType<{ data: T }> },
): CardRenderer {
  const { Body, Actions, ...appearance } = definition;
  return { contract: reference(contract), resolve(raw) {
    const parsed = contract.schema.safeParse(raw);
    if (!parsed.success) return null;
    return { ...appearance, body: createElement(Body, { data: parsed.data }),
      actions: Actions ? createElement(Actions, { data: parsed.data }) : undefined };
  } };
}
export function resultRenderer<T extends Json>(contract: DataContract<T>, Component: ComponentType<{ data: T }>): ResultRenderer {
  return { contract: reference(contract), resolve(raw) {
    const parsed = contract.schema.safeParse(raw);
    return parsed.success ? createElement(Component, { data: parsed.data }) : null;
  } };
}
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
  private readonly results: ReadonlyMap<string, ResultRenderer>;
  constructor(modules: readonly RendererModule[]) {
    for (const resource of modules.flatMap(module => module.resources)) {
      if (this.resources.has(resource.kind)) throw new Error(`Duplicate resource description: ${resource.kind}`);
      this.resources.set(resource.kind, resource);
    }
    this.cards = index(modules.flatMap(module => module.cards));
    this.results = index(modules.flatMap(module => module.results));
  }
  resource(kind: string): ResourceDescription {
    return this.resources.get(kind) ?? { kind, label: t.kindResource, icon: createElement(Box, { className: "size-4" }) };
  }
  card(presentation: Presentation): CardView | null {
    return this.cards.get(contractKey(presentation.contract))?.resolve(presentation.data) ?? null;
  }
  result(contract: ContractReference | undefined, data: Json): ReactNode {
    return contract ? this.results.get(contractKey(contract))?.resolve(data) ?? null : null;
  }
}
