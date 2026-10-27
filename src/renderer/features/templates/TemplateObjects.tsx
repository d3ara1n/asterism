import type { TemplateObjectSummary } from "../../../shared/templates";
import { useModuleViews } from "../../modules/views";
import { useI18n } from "../../shared/i18n";

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
