import { useMemo, useRef, useState } from "react";
import { Info, LayoutTemplate, MoreHorizontal, Trash2 } from "lucide-react";
import type { UiText } from "@atelier/sdk/contracts";
import type { TemplateSummary, TemplateObjectSummary } from "../../../shared/templates";
import { templateMessages } from "../../../shared/template-messages";
import { errorDisplay } from "../../../shared/error-display";
import { runtime } from "../../runtime";
import { useI18n } from "../../shared/i18n";
import { useModuleViews } from "../../modules/views";
import { commonMessages } from "@atelier/ui/messages/common";
import { Button } from "@atelier/ui/ui/button";
import { Item } from "@atelier/ui/ui/item";
import { Spinner } from "@atelier/ui/ui/spinner";
import { StatusText } from "@atelier/ui/ui/status";
import { Tooltip, TooltipContent, TooltipTrigger } from "@atelier/ui/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@atelier/ui/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@atelier/ui/ui/alert-dialog";
import { TemplateObjectLabel } from "./TemplateObjects";

const KIND_PREVIEW_LIMIT = 6;

export function TemplateCards({ templates, ready, onStart, onChanged }: {
  templates: readonly TemplateSummary[]; ready: boolean;
  onStart: (id: string) => Promise<UiText | null>; onChanged: () => void;
}) {
  const i18n = useI18n();
  return <section aria-labelledby="templates-title" className="mt-10">
    <h2 id="templates-title" className="type-section mb-4">{i18n.text(templateMessages.templates)}</h2>
    <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
      {templates.map(template => <TemplateCard key={template.id} template={template} ready={ready} onStart={onStart} onChanged={onChanged} />)}
    </div>
    {!templates.length && <p className="type-caption">{i18n.text(templateMessages.empty)}</p>}
  </section>;
}

/** Kind-signature preview: shows unique resource type icons with per-kind counts. */
function TemplatePreview({ objects }: { objects: readonly TemplateObjectSummary[] }) {
  const registry = useModuleViews();
  const groups = useMemo(() => {
    const map = new Map<string, number>();
    for (const { kind } of objects) map.set(kind, (map.get(kind) ?? 0) + 1);
    return [...map.entries()].map(([kind, count]) => ({ kind, count }));
  }, [objects]);
  const shown = groups.slice(0, KIND_PREVIEW_LIMIT);
  const overflow = groups.length - shown.length;
  if (!shown.length) {
    return <span className="flex flex-1 items-center justify-center">
      <LayoutTemplate className="size-8" strokeWidth={1} />
    </span>;
  }
  return <span className="flex flex-1 flex-wrap content-center items-center justify-center gap-x-3 gap-y-2 p-3">
    {shown.map(({ kind, count }) => {
      const descriptor = registry.resource(kind);
      return <span key={kind} className="flex flex-col items-center gap-1">
        <span className="[&_svg]:size-4">{descriptor.icon}</span>
        {count > 1 && <span className="text-[10px] leading-none opacity-60">×{count}</span>}
      </span>;
    })}
    {overflow > 0 && <span className="text-xs opacity-50">+{overflow}</span>}
  </span>;
}

function TemplateCard({ template, ready, onStart, onChanged }: {
  template: TemplateSummary; ready: boolean; onStart: (id: string) => Promise<UiText | null>; onChanged: () => void;
}) {
  const i18n = useI18n();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiText | null>(null);
  const [deleting, setDeleting] = useState(false);
  const starting = busy && !deleting;
  const run = async (action: () => Promise<UiText | null>, onSuccess?: () => void) => {
    if (pending.current || !ready) return;
    pending.current = true; setBusy(true); setError(null);
    try {
      const err = await action();
      setError(err);
      if (!err) onSuccess?.();
    }
    catch { setError(commonMessages.connectionLost); }
    finally { pending.current = false; setBusy(false); }
  };
  const remove = async () => {
    const result = await runtime.session.execute({ type: "template.delete", templateId: template.id });
    if (!result.ok) return errorDisplay(result.error);
    return null;
  };
  return <div className="min-w-0">
    <div className="group relative">
      <Item variant="outline" asChild className="w-full overflow-hidden bg-card p-0 text-left hover:bg-accent/50 disabled:opacity-50">
        <button type="button" disabled={!ready || busy} aria-busy={starting} onClick={() => void run(() => onStart(template.id))}>
          <span className="relative flex h-20 w-full overflow-hidden bg-muted text-muted-foreground" aria-hidden="true">
            <TemplatePreview objects={template.objects} />
            {starting && <span className="absolute inset-0 flex items-center justify-center bg-muted/80"><Spinner className="size-8" /></span>}
          </span>
          <span className="block w-full min-w-0 px-3 pb-3">
            <span className="block truncate font-medium" title={template.title}>{template.title}</span>
            <span className="type-caption mt-1 block pr-8">{i18n.formatMessage(templateMessages.objectCount, { count: template.objects.length })}</span>
          </span>
        </button>
      </Item>
      <div className="absolute bottom-2 right-2">
        <Tooltip delayDuration={250}>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label={i18n.text(templateMessages.info)}><Info /></Button>
          </TooltipTrigger>
          <TooltipContent side="top" align="end" sideOffset={6} className="max-w-80 text-left text-wrap">
            <p className="mb-2 font-medium">{template.title}</p>
            <ul className="max-h-64 space-y-2 overflow-y-auto">
              {template.objects.map(object => <li key={object.id}><TemplateObjectLabel object={object} /></li>)}
            </ul>
            <p className="mt-3 opacity-70">{i18n.formatMessage(templateMessages.created, { time: Date.parse(template.createdAt) })}</p>
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="absolute right-2 top-2 opacity-0 focus-within:opacity-100 group-hover:opacity-100 has-[[data-state=open]]:opacity-100">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" disabled={!ready || busy} aria-label={i18n.text(templateMessages.actions)}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
              <Trash2 />{i18n.text(templateMessages.delete)}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
    {starting && <span role="status" className="sr-only">{i18n.text(templateMessages.starting)}</span>}
    {error && !deleting && <p role="alert" className="mt-2 text-sm"><StatusText tone="error">{i18n.text(error)}</StatusText></p>}
    <AlertDialog open={deleting} onOpenChange={open => { if (!pending.current) { setDeleting(open); setError(null); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{i18n.text(templateMessages.delete)}</AlertDialogTitle>
          <AlertDialogDescription>{i18n.formatMessage(templateMessages.deleteDescription, { title: template.title })}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p role="alert"><StatusText tone="error">{i18n.text(error)}</StatusText></p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{i18n.text(commonMessages.cancel)}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={busy || !ready}
            onClick={event => { event.preventDefault(); void run(remove, () => { setDeleting(false); onChanged(); }); }}>
            {busy && <Spinner />}{i18n.text(templateMessages.delete)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
