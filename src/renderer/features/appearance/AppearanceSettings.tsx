import { Monitor, Sun, Moon, FileText, Bot, Palette } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { getBezierPath, getSmoothStepPath, Position } from "@xyflow/react";

import { accentIds, defaultFontSize, fontSizeRange, grayIds, palettes, themeTokens, type AccentId, type Appearance, type GrayId } from "../../../shared/theme";
import { appearanceMessages } from "../../messages/appearance";
import { getI18n, useI18n } from "../../shared/i18n";
import { Button } from "@asterism/ui/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@asterism/ui/ui/dialog";
import { FontPicker } from "@asterism/ui/ui/font-picker";
import { NumberInput } from "@asterism/ui/ui/number-input";
import { ItemGroup, ItemSeparator, Item, ItemContent, ItemTitle, ItemDescription, ItemActions } from "@asterism/ui/ui/item";
import { SwatchGroup, ColorSwatch, TileSwatch } from "@asterism/ui/ui/swatch";
import { ToggleGroup, ToggleGroupItem } from "@asterism/ui/ui/toggle-group";
import { Section } from "../settings/layout";
import { updateAppearance, useAppearance, useScheme } from "./state";

const paletteMessages: Record<string, import("@asterism/sdk/contracts").UiMessage> = {
  tundra: appearanceMessages.paletteTundra, graphite: appearanceMessages.paletteGraphite, sky: appearanceMessages.paletteSky, ink: appearanceMessages.paletteInk,
  lagoon: appearanceMessages.paletteLagoon, celadon: appearanceMessages.paletteCeladon, meadow: appearanceMessages.paletteMeadow, honey: appearanceMessages.paletteHoney,
  terracotta: appearanceMessages.paletteTerracotta, coral: appearanceMessages.paletteCoral, rose: appearanceMessages.paletteRose, dusk: appearanceMessages.paletteDusk,
};
const getAccentLabels = (): Record<AccentId, string> => {
  const f = getI18n().formatMessage;
  return {
    blue: f(appearanceMessages.blue), cyan: f(appearanceMessages.cyan), teal: f(appearanceMessages.teal), jade: f(appearanceMessages.jade),
    grass: f(appearanceMessages.grass), amber: f(appearanceMessages.amber), orange: f(appearanceMessages.orange), tomato: f(appearanceMessages.tomato),
    crimson: f(appearanceMessages.crimson), plum: f(appearanceMessages.plum), violet: f(appearanceMessages.violet), indigo: f(appearanceMessages.indigo),
    graphite: f(appearanceMessages.graphite),
  };
};
const getGrayLabels = (): Record<GrayId, string> => {
  const f = getI18n().formatMessage;
  return {
    gray: f(appearanceMessages.neutral), slate: f(appearanceMessages.slate), sage: f(appearanceMessages.sage),
    olive: f(appearanceMessages.olive), sand: f(appearanceMessages.sand), mauve: f(appearanceMessages.mauve),
  };
};
const getFontText = () => ({
  defaultLabel: getI18n().formatMessage(appearanceMessages.systemDefault),
  searchPlaceholder: getI18n().formatMessage(appearanceMessages.searchFonts),
  emptyText: getI18n().formatMessage(appearanceMessages.noMatchingFonts),
  unavailableText: getI18n().formatMessage(appearanceMessages.fontsUnavailable),
});
const radiusCorner: Record<Appearance["radius"], string> = { none: "0px", sm: "3px", md: "5px", lg: "8px" };

/** Terminal font size resets to its default; code font size resets to automatic, where arrow keys start from the default font size. */
function FontSizeField({ kind, value }: { kind: "terminal" | "code"; value: number | null }) {
  const i18n = useI18n();
  const code = kind === "code";
  return <NumberInput value={value} defaultValue={code ? null : defaultFontSize} {...fontSizeRange} unit="px" locale={i18n.locale}
    emptyLabel={code ? i18n.formatMessage(appearanceMessages.auto) : undefined}
    label={i18n.formatMessage(code ? appearanceMessages.codeFontSize : appearanceMessages.terminalFontSize)}
    resetLabel={i18n.formatMessage(code ? appearanceMessages.resetCodeFontSize : appearanceMessages.resetTerminalFontSize)}
    onValueChange={next => {
      if (code) void updateAppearance({ codeFontSize: next });
      else if (next !== null) void updateAppearance({ terminalFontSize: next });
    }} />;
}

/** CSS illustrations of canvas textures, corresponding to the three React Flow Background variants; colors come from --canvas-grid. */
function texture(kind: Appearance["canvas"], gap = 12): CSSProperties {
  const c = "var(--canvas-grid)";
  if (kind === "dots") return { backgroundImage: `radial-gradient(circle, ${c} 1px, transparent 1.2px)`, backgroundSize: `${gap}px ${gap}px` };
  if (kind === "lines") return { backgroundImage: `linear-gradient(${c} 1px, transparent 1px), linear-gradient(90deg, ${c} 1px, transparent 1px)`, backgroundSize: `${gap}px ${gap}px` };
  if (kind === "cross") {
    const arm = `linear-gradient(${c}, ${c})`;
    return { backgroundImage: `${arm}, ${arm}`, backgroundSize: "6px 1px, 1px 6px", backgroundRepeat: "no-repeat",
      backgroundPosition: "center", maskImage: undefined, ...crossTile(gap) };
  }
  return {};
}
/** Crosses require tiling: draw with a repeating SVG because gradients cannot repeat a centered cross within each cell. */
function crossTile(gap: number): CSSProperties {
  const h = gap / 2;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${gap}' height='${gap}'><path d='M${h - 3} ${h}H${h + 3}M${h} ${h - 3}V${h + 3}' stroke='black' stroke-width='1'/></svg>`;
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  return { backgroundImage: "none", backgroundColor: "var(--canvas-grid)", maskImage: url, maskSize: `${gap}px ${gap}px`, WebkitMaskImage: url, WebkitMaskSize: `${gap}px ${gap}px` };
}
function Texture({ kind, gap }: { kind: Appearance["canvas"]; gap?: number }) {

  return <span aria-hidden="true" className="absolute inset-0" style={texture(kind, gap)} />;
}

/** Illustrations reuse the workbench's native path algorithms; staggered endpoints make all three styles recognizable. */
function ConnectionPreview({ kind }: { kind: Appearance["edgeStyle"] }) {
  const endpoints = { sourceX: 4, sourceY: 12, sourcePosition: Position.Right, targetX: 96, targetY: 44, targetPosition: Position.Left };
  const [path] = kind === "default" ? getBezierPath(endpoints) : getSmoothStepPath({ ...endpoints, borderRadius: kind === "step" ? 0 : 5 });
  return <svg aria-hidden="true" viewBox="0 0 100 56" preserveAspectRatio="none" className="h-14 w-full text-primary">
    <path d={path} fill="none" stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    <circle cx={4} cy={12} r={2} fill="currentColor" />
    <circle cx={96} cy={44} r={2} fill="currentColor" />
  </svg>;
}

/** Appearance settings: changes save and apply immediately; the top preview updates live with every option. */
export function AppearanceSettings() {
  const i18n = useI18n();
  const appearance = useAppearance();
  const scheme = useScheme();
  const [picking, setPicking] = useState(false);
  return <div className="flex flex-col">
    <LivePreview appearance={appearance} />

    <Section title={i18n.formatMessage(appearanceMessages.color)} action={<Button size="sm" variant="outline" onClick={() => setPicking(true)}><Palette />{i18n.formatMessage(appearanceMessages.choosePalette)}</Button>}>
      <ItemGroup className="surface">
        <Row label={i18n.formatMessage(appearanceMessages.mode)} hint={i18n.formatMessage(appearanceMessages.modeHint)}>
          <ToggleGroup type="single" variant="outline" size="sm" aria-label={i18n.formatMessage(appearanceMessages.modeLabel)} value={appearance.mode}
            onValueChange={mode => mode && void updateAppearance({ mode: mode as Appearance["mode"] })}>
            <ToggleGroupItem value="system" className="px-2.5"><Monitor />{i18n.formatMessage(appearanceMessages.system)}</ToggleGroupItem>
            <ToggleGroupItem value="light" className="px-2.5"><Sun />{i18n.formatMessage(appearanceMessages.light)}</ToggleGroupItem>
            <ToggleGroupItem value="dark" className="px-2.5"><Moon />{i18n.formatMessage(appearanceMessages.dark)}</ToggleGroupItem>
          </ToggleGroup>
        </Row>
        <ItemSeparator />
        <Row label={i18n.formatMessage(appearanceMessages.accentColor)} hint={getAccentLabels()[appearance.accent]}>
          <SwatchGroup aria-label={i18n.formatMessage(appearanceMessages.accentColorLabel)} value={appearance.accent} onValueChange={accent => void updateAppearance({ accent: accent as AccentId })}>
            {accentIds.map(id => <ColorSwatch key={id} value={id} label={getAccentLabels()[id]} className="border-transparent">
              <span className="absolute inset-0" style={{ background: themeTokens({ ...appearance, accent: id }, scheme).primary }} />
            </ColorSwatch>)}
          </SwatchGroup>
        </Row>
        <ItemSeparator />
        <Row label={i18n.formatMessage(appearanceMessages.gray)} hint={getGrayLabels()[appearance.gray]}>
          <SwatchGroup aria-label={i18n.formatMessage(appearanceMessages.grayLabel)} value={appearance.gray} onValueChange={gray => void updateAppearance({ gray: gray as GrayId })}>
            {grayIds.map(id => {
              const t = themeTokens({ ...appearance, gray: id }, scheme);
              return <ColorSwatch key={id} value={id} label={getGrayLabels()[id]}>
                <span className="absolute inset-0 flex">
                  <span className="flex-1" style={{ background: t.canvas }} />
                  <span className="flex-1" style={{ background: t.border }} />
                  <span className="flex-1" style={{ background: t["muted-foreground"] }} />
                </span>
              </ColorSwatch>;
            })}
          </SwatchGroup>
        </Row>
      </ItemGroup>
    </Section>

    <Section title={i18n.formatMessage(appearanceMessages.shape)}>
      <ItemGroup className="surface">
        <Row label={i18n.formatMessage(appearanceMessages.cornerRadius)}>
          <ToggleGroup type="single" variant="outline" size="sm" aria-label={i18n.formatMessage(appearanceMessages.cornerRadiusLabel)} value={appearance.radius}
            onValueChange={radius => radius && void updateAppearance({ radius: radius as Appearance["radius"] })}>
            {([["none", i18n.formatMessage(appearanceMessages.square)], ["sm", i18n.formatMessage(appearanceMessages.small)], ["md", i18n.formatMessage(appearanceMessages.medium)], ["lg", i18n.formatMessage(appearanceMessages.large)]] as const).map(([v, text]) =>
              <ToggleGroupItem key={v} value={v} aria-label={text} title={text} className="px-2.5">
                <span aria-hidden="true" className="size-3.5 border-t-2 border-l-2 border-current" style={{ borderTopLeftRadius: radiusCorner[v] }} />
              </ToggleGroupItem>)}
          </ToggleGroup>
        </Row>
        <ItemSeparator />
        <Row label={i18n.formatMessage(appearanceMessages.density)} hint={i18n.formatMessage(appearanceMessages.densityHint)}>
          <ToggleGroup type="single" variant="outline" size="sm" aria-label={i18n.formatMessage(appearanceMessages.densityLabel)} value={appearance.density}
            onValueChange={density => density && void updateAppearance({ density: density as Appearance["density"] })}>
            <ToggleGroupItem value="compact" className="px-2.5">{i18n.formatMessage(appearanceMessages.compact)}</ToggleGroupItem>
            <ToggleGroupItem value="standard" className="px-2.5">{i18n.formatMessage(appearanceMessages.standard)}</ToggleGroupItem>
            <ToggleGroupItem value="comfortable" className="px-2.5">{i18n.formatMessage(appearanceMessages.comfortable)}</ToggleGroupItem>
          </ToggleGroup>
        </Row>
      </ItemGroup>
    </Section>

    <Section title={i18n.formatMessage(appearanceMessages.fonts)} hint={i18n.formatMessage(appearanceMessages.fontsHint)}>
      <ItemGroup className="surface">
        <Row label={i18n.formatMessage(appearanceMessages.interfaceFont)}>
          <FontPicker aria-label={i18n.formatMessage(appearanceMessages.interfaceFontLabel)} value={appearance.uiFont} onValueChange={uiFont => void updateAppearance({ uiFont })} {...getFontText()} />
        </Row>
        <ItemSeparator />
        <Row label={i18n.formatMessage(appearanceMessages.terminalFont)}>
          <FontSizeField kind="terminal" value={appearance.terminalFontSize} />
          <FontPicker aria-label={i18n.formatMessage(appearanceMessages.terminalFont)} monospaceOnly showAllLabel={i18n.formatMessage(appearanceMessages.showAllFonts)}
            value={appearance.terminalFont} onValueChange={terminalFont => void updateAppearance({ terminalFont })} {...getFontText()} />
        </Row>
        <ItemSeparator />
        <Row label={i18n.formatMessage(appearanceMessages.codeFont)}>
          <FontSizeField kind="code" value={appearance.codeFontSize} />
          <FontPicker aria-label={i18n.formatMessage(appearanceMessages.codeFontLabel)} monospaceOnly showAllLabel={i18n.formatMessage(appearanceMessages.showAllFonts)}
            value={appearance.codeFont} onValueChange={codeFont => void updateAppearance({ codeFont })} {...getFontText()} />
        </Row>
      </ItemGroup>
    </Section>

    <Section title={i18n.formatMessage(appearanceMessages.canvas)} hint={i18n.formatMessage(appearanceMessages.canvasHint)}>
      <p className="type-label mb-2">{i18n.formatMessage(appearanceMessages.canvasTexture)}</p>
      <SwatchGroup aria-label={i18n.formatMessage(appearanceMessages.canvasTexture)} value={appearance.canvas} onValueChange={canvas => void updateAppearance({ canvas: canvas as Appearance["canvas"] })}>
        {([["dots", i18n.formatMessage(appearanceMessages.dots)], ["lines", i18n.formatMessage(appearanceMessages.grid)], ["cross", i18n.formatMessage(appearanceMessages.crosses)], ["none", i18n.formatMessage(appearanceMessages.none)]] as const).map(([v, text]) =>
          <TileSwatch key={v} value={v} label={text}><Texture kind={v} /></TileSwatch>)}
      </SwatchGroup>
      <p className="type-label mb-2 mt-4">{i18n.formatMessage(appearanceMessages.edgeStyle)}</p>
      <SwatchGroup aria-label={i18n.formatMessage(appearanceMessages.edgeStyle)} value={appearance.edgeStyle}
        onValueChange={edgeStyle => void updateAppearance({ edgeStyle: edgeStyle as Appearance["edgeStyle"] })}>
        {([["default", appearanceMessages.edgeCurved], ["step", appearanceMessages.edgeStep], ["smoothstep", appearanceMessages.edgeSmoothStep]] as const).map(([value, label]) =>
          <TileSwatch key={value} value={value} label={i18n.formatMessage(label)}>
            <ConnectionPreview kind={value} />
          </TileSwatch>)}
      </SwatchGroup>
    </Section>

    <PaletteDialog open={picking} onOpenChange={setPicking} appearance={appearance} />
  </div>;
}

/** Live preview: a canvas, object card, and primary button consume current tokens directly, reflecting corner radius, density, and light/dark mode. */
/**
 * Live preview: a miniature workbench scene. A link grants the agent access to the note resource, and the agent card shows a ready-to-run state;
 * each element represents a token category: canvas texture, cards, borders, secondary text, primary color, and connections.
 */
function LivePreview({ appearance }: { appearance: Appearance }) {
  const i18n = useI18n();
  return <div aria-hidden="true" className="surface relative mt-2 overflow-hidden bg-canvas">
    <Texture kind={appearance.canvas} gap={20} />
    <div className="relative flex items-center px-8 py-7">
      <div className="w-48 shrink-0 -translate-y-4 rounded-lg border bg-card p-3 shadow-sm">
        <p className="type-label flex items-center gap-1.5 text-muted-foreground"><FileText className="size-3.5" />{i18n.formatMessage(appearanceMessages.previewNote)}</p>
        <p className="type-section mt-1 truncate">{i18n.formatMessage(appearanceMessages.previewChecklist)}</p>
        <div className="mt-2 space-y-1.5">
          <span className="block h-1.5 w-full rounded-full bg-muted" />
          <span className="block h-1.5 w-4/5 rounded-full bg-muted" />
          <span className="block h-1.5 w-3/5 rounded-full bg-muted" />
        </div>
      </div>
      {/* Connection: from resource to agent, with connection points at both ends and an authorization label. */}
      <div className="relative flex min-w-16 flex-1 items-center">
        <ConnectionPreview kind={appearance.edgeStyle} />
        <span className="absolute left-1/2 -translate-x-1/2 -translate-y-8 rounded-sm bg-canvas px-1 text-[10px] text-muted-foreground">{i18n.formatMessage(appearanceMessages.previewRead)}</span>
      </div>
      <div className="w-52 shrink-0 translate-y-4 rounded-lg border bg-card shadow-sm">
        <div className="flex items-center gap-1.5 p-3 pb-2">
          <Bot className="size-3.5 text-muted-foreground" />
          <p className="type-section min-w-0 flex-1 truncate">{i18n.formatMessage(appearanceMessages.previewReviewer)}</p>
          <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">{i18n.formatMessage(appearanceMessages.previewReady)}</span>
        </div>
        <p className="type-caption px-3">{i18n.formatMessage(appearanceMessages.previewResourceCount)}</p>
        <p className="mx-3 mt-1.5 truncate rounded-sm bg-muted px-1.5 py-0.5 text-[11px]"><span className="type-code text-muted-foreground">read("checklist.md")</span></p>
        <div className="mt-2 flex justify-end gap-1.5 border-t p-2">
          <span className="rounded-md border bg-card px-2.5 py-1 text-xs">{i18n.formatMessage(appearanceMessages.previewEdit)}</span>
          <span className="rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground">{i18n.formatMessage(appearanceMessages.previewRun)}</span>
        </div>
      </div>
    </div>
  </div>;
}

/** Palettes are only shortcuts for combinations: no selected state; choosing one writes accent + gray and closes. */
function PaletteDialog({ open, onOpenChange, appearance }: { open: boolean; onOpenChange: (open: boolean) => void; appearance: Appearance }) {
  const i18n = useI18n();
  const scheme = useScheme();
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{i18n.formatMessage(appearanceMessages.paletteLabel)}</DialogTitle>
        <DialogDescription>{i18n.formatMessage(appearanceMessages.paletteHint)}</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {palettes.map(palette => {
          const t = themeTokens({ ...appearance, accent: palette.accent, gray: palette.gray }, scheme);
          const name = i18n.text(paletteMessages[palette.id]!);
          return <Item key={palette.id} asChild variant="outline" className="flex-col items-stretch gap-0 overflow-hidden bg-card p-0 text-left hover:border-ring/60"><button type="button"
            onClick={() => { void updateAppearance({ accent: palette.accent, gray: palette.gray }); onOpenChange(false); }}>
            {/* Miniature UI: background, cards, primary color bars, and secondary text bars. */}
            <span aria-hidden="true" className="flex h-16 gap-1.5 p-2" style={{ background: t.canvas }}>
              <span className="flex flex-1 flex-col gap-1 rounded-sm border p-1.5" style={{ background: t.card, borderColor: t.border }}>
                <span className="h-1.5 w-3/4 rounded-full" style={{ background: t.foreground }} />
                <span className="h-1 w-1/2 rounded-full" style={{ background: t["muted-foreground"] }} />
                <span className="mt-auto h-2 w-8 rounded-sm" style={{ background: t.primary }} />
              </span>
              <span className="w-3 rounded-sm" style={{ background: t.selected }} />
            </span>
            <span className="block px-2 py-1.5 text-sm">{name}</span>
          </button></Item>;
        })}
      </div>
    </DialogContent>
  </Dialog>;
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {

  return <Item size="sm"><ItemContent><ItemTitle>{label}</ItemTitle>{hint && <ItemDescription>{hint}</ItemDescription>}</ItemContent><ItemActions>{children}</ItemActions></Item>;
}
