import type { TemplateObjectSummary } from "../../../shared/templates";
import { useModuleViews } from "../../modules/views";
import { useI18n } from "../../shared/i18n";

/** Resource kinds in first-appearance order; template previews show one icon per kind. */
export function templateKinds(objects: readonly TemplateObjectSummary[]): string[] {
  return [...new Set(objects.map(object => object.kind))];
}

export function TemplateObjectLabel({ object }: { object: TemplateObjectSummary }) {
  const registry = useModuleViews();
  const i18n = useI18n();
  const descriptor = registry.resource(object.kind);
  return <span className="flex min-w-0 items-start gap-2">
    <span aria-hidden="true" className="mt-0.5 shrink-0 [&_svg]:size-4">{descriptor.icon}</span>
    <span className="min-w-0 break-words">
      <span className="opacity-70">{i18n.text(descriptor.label)}</span>
      {object.title !== undefined ? <span className="ml-2">{object.title}</span> : null}
    </span>
  </span>;
}

/** Compact one-line kind signature; the accompanying object count carries the accessible description. */
export function TemplateKindIcons({ objects, limit = 4 }: { objects: readonly TemplateObjectSummary[]; limit?: number }) {
  const registry = useModuleViews();
  const kinds = templateKinds(objects);
  const overflow = kinds.length - limit;
  return <span aria-hidden="true" className="flex shrink-0 items-center gap-1.5 [&_svg]:size-3.5">
    {kinds.slice(0, limit).map(kind => <span key={kind}>{registry.resource(kind).icon}</span>)}
    {overflow > 0 && <span className="text-xs">+{overflow}</span>}
  </span>;
}
