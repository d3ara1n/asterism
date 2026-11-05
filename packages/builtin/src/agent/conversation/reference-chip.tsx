import type { ReactNode } from "react";
import { useI18n } from "@asterism-app/sdk/renderer";
import { cn } from "@asterism-app/ui/utils";
import { BookOpen, FileText, Folder, Link2, X, type LucideIcon } from "lucide-react";
import { conversationMessages } from "../../messages/conversation";
import { referenceKind, type ReferenceKind } from "./reference-serialization";

/** Icon and tone per reference kind: skills use violet, resource locations use blue. */
const kindStyles: Record<ReferenceKind, { icon: LucideIcon; tone: string }> = {
  skill: { icon: BookOpen, tone: "border-folder-violet/30 bg-folder-violet/10 [&_[data-chip-icon]]:text-folder-violet" },
  directory: { icon: Folder, tone: "border-folder-blue/30 bg-folder-blue/10 [&_[data-chip-icon]]:text-folder-blue" },
  file: { icon: FileText, tone: "border-folder-blue/30 bg-folder-blue/10 [&_[data-chip-icon]]:text-folder-blue" },
};
const unknownStyle = { icon: Link2, tone: "border-border bg-muted [&_[data-chip-icon]]:text-muted-foreground" };

/** Shared chip presentation for references in the composer and in rendered messages. */
export function ReferenceChipFace({ href, children, selected = false, onRemove }: {
  href: string; children: ReactNode; selected?: boolean;
  /** Present in the composer; omitted where the chip is read-only. */
  onRemove?(): void;
}) {
  const i18n = useI18n();
  const kind = referenceKind(href);
  const { icon: Icon, tone } = kind ? kindStyles[kind] : unknownStyle;
  return <span data-reference-chip="" data-kind={kind ?? undefined} title={href}
    className={cn("mx-0.5 inline-flex h-5 max-w-60 select-none items-center gap-1 rounded-md border px-1 align-text-bottom text-xs font-medium leading-none text-foreground no-underline",
      tone, selected && "ring-2 ring-ring")}>
    <Icon data-chip-icon="" className="size-3.5 shrink-0" aria-hidden />
    <span className="truncate" translate="no">{children}</span>
    {onRemove && <button type="button" tabIndex={-1}
      className="-mr-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
      aria-label={i18n.text(conversationMessages.removeReference)} title={i18n.text(conversationMessages.removeReference)}
      // Keep the editor selection; deleting must not move focus out of the composer.
      onMouseDown={event => event.preventDefault()}
      onClick={onRemove}><X className="size-3" /></button>}
  </span>;
}
