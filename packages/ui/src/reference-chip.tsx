import { Children, cloneElement, createContext, isValidElement, useContext, useEffect, useState, type ComponentProps, type ComponentType, type ReactNode } from "react";
import { ModelCatalog, formatModelExpression, parseModelUrl, parseResourceUrl, parseSkillUrl, resourceUrl, type ModelExpression, type ResourceRef, type UiText } from "@asterism-app/sdk/contracts";
import { useI18n, useRendererCatalogs, useRendererResourceNavigation, useRendererResources, type RendererResourceIdentity } from "@asterism-app/sdk/renderer";
import { BookOpen, Box, Cpu, Link2, X, type LucideIcon } from "lucide-react";
import { cn } from "./utils";
import { commonMessages } from "./messages/common";
import { failureDisplay } from "./error-display";
import { referenceKind, splitReferenceLabel, type ReferenceKind } from "./references";
import { Badge } from "./ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./ui/hover-card";
import { Spinner } from "./ui/spinner";
import { ModelReferenceDetails } from "./model-reference-details";

/**
 * Reference schemes have distinct icons and tones.
 * The face derives only from the link itself so it stays fixed while the workbench changes; the hover card shows current state.
 */
const kindStyles: Record<ReferenceKind, { icon: LucideIcon; tone: string }> = {
  skill: { icon: BookOpen, tone: "border-folder-violet/30 bg-folder-violet/10 [&_[data-chip-icon]]:text-folder-violet" },
  resource: { icon: Box, tone: "border-folder-blue/30 bg-folder-blue/10 [&_[data-chip-icon]]:text-folder-blue" },
  model: { icon: Cpu, tone: "border-folder-teal/30 bg-folder-teal/10 [&_[data-chip-icon]]:text-folder-teal" },
};
const unknownStyle = { icon: Link2, tone: "border-border bg-muted [&_[data-chip-icon]]:text-muted-foreground" };

/**
 * Face sizes: inline matches body text, title matches panel titles. Line boxes fill the content box (height minus the
 * 1px borders), so the label's text is vertically centered. A zero-width strut with the same line box is the only item in
 * baseline alignment: the chip's baseline is the label's, and align-baseline puts it on the surrounding text's baseline.
 * The strut stands in for the label because the truncating label clips overflow, which can drop its baseline.
 */
const sizes = {
  inline: { face: "h-5 px-1 text-xs", line: "leading-[1.125rem]", icon: "mr-1 size-3.5", remove: "ml-1" },
  title: { face: "h-6 px-1.5 text-sm", line: "leading-[1.375rem]", icon: "mr-1.5 size-4", remove: "ml-1.5" },
} as const;
export type ReferenceChipSize = keyof typeof sizes;

/** Carry the first-colon boundary across inline Markdown nodes without changing their text or formatting. */
function ReferenceLabel({ children }: { children: ReactNode }) {
  let inSupplement = false;
  const render = (nodes: ReactNode): ReactNode => Children.map(nodes, node => {
    if (inSupplement) return <span className="text-muted-foreground">{node}</span>;
    if (typeof node === "string") {
      const { primary, supplement } = splitReferenceLabel(node);
      if (supplement === null) return node;
      inSupplement = true;
      return <>{primary}<span className="text-muted-foreground">{supplement}</span></>;
    }
    if (isValidElement<{ children?: ReactNode }>(node) && node.props.children !== undefined) {
      return cloneElement(node, undefined, render(node.props.children));
    }
    return node;
  });
  return render(children);
}

/** Shared chip presentation for references in the composer, rendered messages, and panel titles. */
export function ReferenceChipFace({ href, children, selected = false, size = "inline", onRemove, className, ...props }: ComponentProps<"span"> & {
  href: string; selected?: boolean; size?: ReferenceChipSize;
  /** Present in the composer; omitted where the chip is read-only. */
  onRemove?(): void;
}) {
  const i18n = useI18n();
  const kind = referenceKind(href);
  const { icon: Icon, tone } = kind ? kindStyles[kind] : unknownStyle;
  const metrics = sizes[size];
  return <span data-reference-chip="" data-kind={kind ?? undefined} {...props}
    className={cn("mx-0.5 inline-flex max-w-60 select-none items-center rounded-md border align-baseline font-medium text-foreground no-underline",
      metrics.face, tone, selected && "ring-2 ring-ring", className)}>
    <Icon data-chip-icon="" className={cn("shrink-0", metrics.icon)} aria-hidden />
    <span className={cn("w-0 self-baseline", metrics.line)} aria-hidden>{"\u200b"}</span>
    <span className={cn("truncate", metrics.line)} translate="no"><ReferenceLabel>{children}</ReferenceLabel></span>
    {onRemove && <button type="button" tabIndex={-1}
      className={cn("-mr-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-foreground/10 hover:text-foreground", metrics.remove)}
      aria-label={i18n.text(commonMessages.removeReference)} title={i18n.text(commonMessages.removeReference)}
      // Keep the editor selection; deleting must not move focus out of the composer.
      onMouseDown={event => event.preventDefault()}
      onClick={onRemove}><X className="size-3" /></button>}
  </span>;
}

/**
 * Skill names resolve through the Agent paradigm's catalog, which this package does not import.
 * The paradigm provides the hover card and the preview opener; without a provider, skill chips stay static.
 */
export interface ReferenceSkills {
  Card: ComponentType<{ name: string; path: string | undefined }>;
  open(name: string, path: string | undefined, origin: HTMLElement): Promise<unknown>;
}
const Skills = createContext<ReferenceSkills | null>(null);
export const ReferenceSkillsProvider = Skills.Provider;

/**
 * A reference chip with a hover card of the target's current state.
 * Resource references need the session that the resource ID belongs to. openable activates the target on click;
 * input surfaces such as the composer omit it because the reference is still being composed.
 */
export function ReferenceChip({ href, sessionId, children, openable = false, selected, size, onRemove }: {
  href: string; sessionId?: string; children: ReactNode; openable?: boolean; selected?: boolean; size?: ReferenceChipSize; onRemove?(): void;
}) {
  const skills = useContext(Skills);
  const navigation = useRendererResourceNavigation();
  const [pending, setPending] = useState(false);
  const skill = parseSkillUrl(href);
  const resource = skill ? null : parseResourceUrl(href);
  const model = parseModelUrl(href);
  const card = skill ? skills && <skills.Card name={skill.name} path={skill.path} />
    : resource && sessionId ? <ResourceCard sessionId={sessionId} id={resource.resourceId} location={resource.location} />
    : model ? <ModelCard model={model} /> : null;
  const activate = !openable ? null
    : skill ? skills && ((origin: HTMLElement) => skills.open(skill.name, skill.path, origin))
    : resource && sessionId ? (origin: HTMLElement) => navigation.open({ sessionId, id: resource.resourceId }, resource.location, { origin }) : null;
  const face = <ReferenceChipFace href={href} selected={selected} size={size} onRemove={onRemove} title={card ? undefined : href}
    tabIndex={model ? 0 : undefined} className={model ? "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" : undefined}>{children}</ReferenceChipFace>;
  const trigger = activate ? <a href={href} className="no-underline" aria-disabled={pending || undefined}
    onAuxClick={event => event.preventDefault()} onClick={event => {
      event.preventDefault();
      if (pending) return;
      setPending(true);
      void activate(event.currentTarget).finally(() => setPending(false));
    }}>{face}</a> : face;
  if (!card) return trigger;
  return <HoverCard openDelay={400} closeDelay={100}>
    <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
    <HoverCardContent side="top" align="start" className={cn("w-72 p-3", model && "max-h-[var(--radix-hover-card-content-available-height)] w-80 max-w-[var(--radix-hover-card-content-available-width)] overflow-y-auto")}>{card}</HoverCardContent>
  </HoverCard>;
}

/** Hover card layout shared by reference kinds: identity row, optional description, then monospaced details. */
export function ReferenceCard({ icon, title, missing = false, loading = false, error = null, description, details = [], children }: {
  icon: ReactNode; title: string; missing?: boolean; loading?: boolean; error?: UiText | null;
  description?: ReactNode; details?: readonly (string | null | undefined)[]; children?: ReactNode;
}) {
  const i18n = useI18n();
  return <div className="flex min-w-0 flex-col gap-1.5">
    <div className="flex min-w-0 items-center gap-2">
      <span className="flex shrink-0 [&_svg]:size-4" aria-hidden>{icon}</span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium" translate="no">{title}</span>
      {loading && <Spinner className="size-3.5 text-muted-foreground" />}
      {missing && <Badge variant="outline">{i18n.text(commonMessages.referenceMissing)}</Badge>}
    </div>
    {error && <p className="type-caption text-destructive">{i18n.text(error)}</p>}
    {description && <p className="type-caption line-clamp-4">{description}</p>}
    {details.filter(Boolean).map((detail, index) => <p key={index} className="type-caption truncate font-mono" title={detail!} translate="no">{detail}</p>)}
    {children}
  </div>;
}

type Read<T> = { status: "loading" } | { status: "ready"; value: T } | { status: "error"; error: UiText };

/** Read the resource's current identity once per mount; hover cards mount when opened, so each hover reads current state. */
function useResourceIdentity(sessionId: string, id: string): Read<RendererResourceIdentity | null> {
  const navigation = useRendererResourceNavigation();
  const [read, setRead] = useState<Read<RendererResourceIdentity | null>>({ status: "loading" });
  useEffect(() => {
    let active = true;
    setRead({ status: "loading" });
    navigation.resolve({ sessionId, id }).then(
      value => { if (active) setRead({ status: "ready", value }); },
      error => { if (active) setRead({ status: "error", error: failureDisplay(error, commonMessages.referenceUnavailable) }); });
    return () => { active = false; };
  }, [navigation, sessionId, id]);
  return read;
}

function ResourceCard({ sessionId, id, location }: { sessionId: string; id: string; location: string }) {
  const i18n = useI18n();
  const resources = useRendererResources();
  const read = useResourceIdentity(sessionId, id);
  const found = read.status === "ready" ? read.value : null;
  const description = found ? resources.get(found.ref.kind) : null;
  return <ReferenceCard icon={description?.icon ?? <Box className="text-muted-foreground" />}
    title={found?.title ?? id} loading={read.status === "loading"} missing={read.status === "ready" && !found}
    error={read.status === "error" ? read.error : null}
    description={description && i18n.text(description.label)} details={[location]} />;
}

/** Mounted on hover and resolved from the current configuration; the chip label remains authored text. */
function ModelCard({ model: address }: { model: ModelExpression }) {
  const catalogs = useRendererCatalogs();
  const catalog = catalogs.get(ModelCatalog);
  const expression = formatModelExpression(address);
  const provider = catalog?.modelProviders.find(entry => entry.id === address.provider);
  const model = provider && catalog?.models.find(entry => entry.providerId === address.provider && entry.modelId === address.model);
  return <ReferenceCard icon={<Cpu className="text-folder-teal" />} title={model?.name ?? expression}
    loading={!catalog && !catalogs.error} missing={catalog !== null && !model} error={catalogs.error}
    description={provider?.name} details={[expression]}>
    {model && provider && <ModelReferenceDetails model={model} enabled={model.enabled && provider.enabled} />}
  </ReferenceCard>;
}

/** Title-bar chip naming the resource that owns the shown content; the kind label stands in until the title is read and when the resource is absent. */
export function ResourceSourceChip({ resource }: { resource: ResourceRef }) {
  const i18n = useI18n();
  const resources = useRendererResources();
  const read = useResourceIdentity(resource.sessionId, resource.id);
  const title = read.status === "ready" && read.value ? read.value.title : i18n.text(resources.get(resource.kind).label);
  return <ReferenceChip href={resourceUrl(resource.id, "")} sessionId={resource.sessionId} size="title">{title}</ReferenceChip>;
}
