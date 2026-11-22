import { TooltipHint } from "@asterism-app/ui/tooltip-hint";
import { useMemo, useRef, useState } from "react";
import { ArrowUpDown, Folder as FolderIcon, Info, LayoutTemplate, MoreHorizontal, PenLine, Trash2 } from "lucide-react";
import type { UiText } from "@asterism-app/sdk/contracts";
import type { TemplateSummary, TemplateObjectSummary } from "../../../shared/templates";
import { templateMessages } from "../../../shared/template-messages";
import { errorDisplay } from "../../../shared/error-display";
import { runtime } from "../../runtime";
import { useI18n } from "../../shared/i18n";
import { useModuleViews } from "../../modules/views";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { Button } from "@asterism-app/ui/ui/button";
import { Item } from "@asterism-app/ui/ui/item";
import { SearchInput } from "@asterism-app/ui/ui/search-input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@asterism-app/ui/ui/select";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { StatusText } from "@asterism-app/ui/ui/status";
import { Tooltip, TooltipContent, TooltipTrigger } from "@asterism-app/ui/ui/tooltip";
import { ActionMenu, ActionMenuContent, ActionMenuGroup, ActionMenuItem, ActionMenuTrigger, ActionMenuTarget } from "@asterism-app/ui/ui/action-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@asterism-app/ui/ui/alert-dialog";
import { TemplateObjectLabel, templateKinds } from "./TemplateObjects";
import { RenameTemplate } from "./RenameTemplate";
import { folderMessages } from "../../../shared/folder-messages";
import { existingFolder, useFolders } from "../folders/context";
import { FolderDialog } from "../folders/FolderDialog";
import { MoveToFolderMenu } from "../folders/menus";
import { FolderDot, folderTint } from "../folders/marks";
import { sortFolders } from "../folders/grouping";
import { templateSorts, viewTemplates, type TemplateFolderFilter, type TemplateSort } from "./catalog";
import { readTemplateFolder, readTemplateSort, writeTemplateFolder, writeTemplateSort } from "./catalog-state";
import { cn } from "@asterism-app/ui/utils";

const KIND_PREVIEW_LIMIT = 6;

// Radix Select values cannot be null; folder identities are UUIDs, so these never collide.
const allFolders = "all", noFolder = "none";
const sortLabels: Record<TemplateSort, UiText> = {
  created: templateMessages.sortCreated, recent: templateMessages.sortRecent,
  "name-asc": templateMessages.sortNameAsc, "name-desc": templateMessages.sortNameDesc,
};

export function TemplateCards({ templates, ready, onStart, onChanged }: {
  templates: readonly TemplateSummary[]; ready: boolean;
  onStart: (id: string) => Promise<UiText | null>; onChanged: () => void;
}) {
  const i18n = useI18n();
  const { folders } = useFolders();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<TemplateSort>(readTemplateSort);
  const [storedFolder, setFolder] = useState<TemplateFolderFilter>(readTemplateFolder);
  // A deleted folder, or one remembered after every folder is gone, reads as all templates.
  const folder = storedFolder === "all" || storedFolder === null ? (folders.length ? storedFolder : "all")
    : existingFolder(folders, storedFolder)?.id ?? "all";
  const visible = viewTemplates(templates, { query, folder, sort }, i18n.locale);
  const selectFolder = (value: string) => {
    const next = value === allFolders ? "all" : value === noFolder ? null : value;
    setFolder(next); writeTemplateFolder(next);
  };
  return <section aria-labelledby="templates-title" className="mt-10">
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <h2 id="templates-title" className="type-section mr-auto">{i18n.text(templateMessages.templates)}</h2>
      {templates.length > 0 && <>
        <div className="w-48"><SearchInput value={query} onChange={setQuery} label={i18n.text(templateMessages.searchTemplates)} /></div>
        {folders.length > 0 && <Select value={folder === "all" ? allFolders : folder ?? noFolder} onValueChange={selectFolder}>
          <SelectTrigger className="w-40" aria-label={i18n.text(templateMessages.folderFilter)}><SelectValue /></SelectTrigger>
          <SelectContent position="popper" align="end"><SelectGroup>
            <SelectItem value={allFolders}><FolderIcon />{i18n.text(commonMessages.all)}</SelectItem>
            <SelectItem value={noFolder}><FolderIcon />{i18n.text(folderMessages.noFolder)}</SelectItem>
            {sortFolders(folders, i18n.locale).map(item => <SelectItem key={item.id} value={item.id}>
              <FolderDot color={item.color} className="mx-1" />{item.name}
            </SelectItem>)}
          </SelectGroup></SelectContent>
        </Select>}
        <Select value={sort} onValueChange={value => { const next = value as TemplateSort; setSort(next); writeTemplateSort(next); }}>
          <SelectTrigger className="w-40" aria-label={i18n.text(templateMessages.sort)}><ArrowUpDown /><SelectValue /></SelectTrigger>
          <SelectContent position="popper" align="end"><SelectGroup>
            {templateSorts.map(item => <SelectItem key={item} value={item}>{i18n.text(sortLabels[item])}</SelectItem>)}
          </SelectGroup></SelectContent>
        </Select>
      </>}
    </div>
    <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
      {visible.map(template => <TemplateCard key={template.id} template={template} ready={ready} onStart={onStart} onChanged={onChanged} />)}
    </div>
    {!templates.length ? <p className="type-caption">{i18n.text(templateMessages.empty)}</p>
      : !visible.length && <p role="status" className="type-caption">{i18n.text(commonMessages.noMatches)}</p>}
  </section>;
}

/** Kind-signature preview: one icon per resource type; object counts belong to the details tooltip. */
function TemplatePreview({ objects }: { objects: readonly TemplateObjectSummary[] }) {
  const registry = useModuleViews();
  const kinds = useMemo(() => templateKinds(objects), [objects]);
  const shown = kinds.slice(0, KIND_PREVIEW_LIMIT);
  const overflow = kinds.length - shown.length;
  if (!shown.length) {
    return <span className="flex flex-1 items-center justify-center">
      <LayoutTemplate className="size-8" strokeWidth={1} />
    </span>;
  }
  return <span className="flex flex-1 flex-wrap content-center items-center justify-center gap-x-3 gap-y-2 p-3">
    {shown.map(kind => <span key={kind} className="[&_svg]:size-4">{registry.resource(kind).icon}</span>)}
    {overflow > 0 && <span className="text-xs opacity-50">+{overflow}</span>}
  </span>;
}

function TemplateCard({ template, ready, onStart, onChanged }: {
  template: TemplateSummary; ready: boolean; onStart: (id: string) => Promise<UiText | null>; onChanged: () => void;
}) {
  const i18n = useI18n();
  const { folders, run: runFolder } = useFolders();
  const folder = existingFolder(folders, template.folderId);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiText | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const openingDialog = useRef(false);
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
  const move = (folderId: string | null) => run(() => runFolder({ type: "template.move", templateId: template.id, folderId }));
  return <div className="min-w-0">
    <ActionMenu modal={false}>
      <ActionMenuTarget asChild disabled={!ready || busy}>
        <div className="group relative">
          <TooltipHint content={template.title}><Item variant="outline" asChild className="w-full overflow-hidden rounded-lg bg-card-shell p-1 text-left transition-colors hover:bg-accent/60 disabled:opacity-50">
            <button type="button" data-action-menu-primary disabled={!ready || busy} aria-busy={starting} onClick={() => void run(() => onStart(template.id))}>
              {/* The folder color marks where new sessions land; the folder name stays in the information tooltip. */}
              {/* The preview is the card's sheet, nested concentrically inside the shell like object card content. */}
              <span className={cn("relative flex h-20 w-full overflow-hidden rounded-(--radius-inset) text-muted-foreground shadow-(--shadow-sheet)", folder ? folderTint(folder.color) : "bg-card")} aria-hidden="true">
                <TemplatePreview objects={template.objects} />
                {starting && <span className="absolute inset-0 flex items-center justify-center bg-muted/80"><Spinner className="size-8" /></span>}
              </span>
              <span className="block w-full min-w-0 px-2 pt-2 pb-1.5">
                <span className="block truncate font-medium">{template.title}</span>
                <span className="type-caption mt-1 block truncate pr-8">
                  {i18n.formatMessage(templateMessages.objectCount, { count: template.objects.length })}
                </span>
              </span>
            </button>
          </Item></TooltipHint>
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
                <p className="mt-3 flex items-center gap-1.5">{i18n.text(folderMessages.folder)}:
                  {folder ? <><FolderDot color={folder.color} />{folder.name}</> : i18n.text(folderMessages.noFolder)}</p>
                <p className="mt-3 opacity-70">{i18n.formatMessage(templateMessages.created, { time: Date.parse(template.createdAt) })}</p>
                {template.lastUsedAt && <p className="opacity-70">{i18n.formatMessage(templateMessages.lastUsed, { time: Date.parse(template.lastUsedAt) })}</p>}
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="absolute right-2 top-2 opacity-0 has-[:focus-visible]:opacity-100 group-hover:opacity-100 has-[[data-state=open]]:opacity-100">
            <ActionMenuTrigger asChild>
              <Button ref={trigger} variant="ghost" size="icon-xs" disabled={!ready || busy} aria-label={i18n.text(templateMessages.actions)}>
                <MoreHorizontal />
              </Button>
            </ActionMenuTrigger>
            <ActionMenuContent align="end" onCloseAutoFocus={event => {
              if (openingDialog.current) { event.preventDefault(); openingDialog.current = false; }
            }}>
              <ActionMenuGroup>
                <ActionMenuItem onSelect={() => { openingDialog.current = true; setError(null); setRenaming(true); }}>
                  <PenLine />{i18n.text(templateMessages.rename)}…
                </ActionMenuItem>
                <MoveToFolderMenu value={template.folderId} onMove={folderId => { void move(folderId); }}
                  onCreate={() => { openingDialog.current = true; setError(null); setCreatingFolder(true); }} />
                <ActionMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
                  <Trash2 />{i18n.text(templateMessages.delete)}
                </ActionMenuItem>
              </ActionMenuGroup>
            </ActionMenuContent>
          </div>
        </div>
      </ActionMenuTarget>
    </ActionMenu>
    {starting && <span role="status" className="sr-only">{i18n.text(templateMessages.starting)}</span>}
    {error && !deleting && <p role="alert" className="mt-2 text-sm"><StatusText tone="error">{i18n.text(error)}</StatusText></p>}
    {renaming && <RenameTemplate template={template} disabled={!ready || busy} onSaved={onChanged}
      onClose={() => setRenaming(false)} onRestoreFocus={() => trigger.current?.focus()} />}
    {creatingFolder && <FolderDialog onSaved={folderId => { void move(folderId); }} onClose={() => setCreatingFolder(false)}
      onRestoreFocus={() => trigger.current?.focus()} />}
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
