import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const appearanceMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
  loadFailed: { id: "appearance.loadFailed", defaultMessage: "Appearance settings could not be loaded." },
  saveFailed: { id: "appearance.saveFailed", defaultMessage: "Appearance settings could not be saved." },
  jade: {
    id: "appearance.accent.jade",
    defaultMessage: "Jade",
  },
  teal: {
    id: "appearance.accent.teal",
    defaultMessage: "Teal",
  },
  blue: {
    id: "appearance.accent.blue",
    defaultMessage: "Blue",
  },
  indigo: {
    id: "appearance.accent.indigo",
    defaultMessage: "Indigo",
  },
  violet: {
    id: "appearance.accent.violet",
    defaultMessage: "Violet",
  },
  crimson: {
    id: "appearance.accent.crimson",
    defaultMessage: "Crimson",
  },
  orange: {
    id: "appearance.accent.orange",
    defaultMessage: "Orange",
  },
  amber: {
    id: "appearance.accent.amber",
    defaultMessage: "Amber",
  },
  cyan: {
    id: "appearance.accent.cyan",
    defaultMessage: "Cyan",
  },
  grass: {
    id: "appearance.accent.grass",
    defaultMessage: "Grass",
  },
  tomato: {
    id: "appearance.accent.tomato",
    defaultMessage: "Tomato",
  },
  plum: {
    id: "appearance.accent.plum",
    defaultMessage: "Plum",
  },
  graphite: {
    id: "appearance.accent.graphite",
    defaultMessage: "Graphite",
  },
  neutral: {
    id: "appearance.gray.neutral",
    defaultMessage: "Neutral",
  },
  sage: {
    id: "appearance.gray.sage",
    defaultMessage: "Sage",
  },
  slate: {
    id: "appearance.gray.slate",
    defaultMessage: "Slate",
  },
  sand: {
    id: "appearance.gray.sand",
    defaultMessage: "Sand",
  },
  mauve: {
    id: "appearance.gray.mauve",
    defaultMessage: "Mauve",
  },
  olive: {
    id: "appearance.gray.olive",
    defaultMessage: "Olive",
  },
  systemDefault: {
    id: "appearance.fonts.systemDefault",
    defaultMessage: "System default",
  },
  searchFonts: {
    id: "appearance.fonts.search",
    defaultMessage: "Search fonts",
  },
  noMatchingFonts: {
    id: "appearance.fonts.noMatch",
    defaultMessage: "No matching fonts.",
  },
  fontsUnavailable: {
    id: "appearance.fonts.unavailable",
    defaultMessage: "Installed fonts are unavailable.",
  },
  color: {
    id: "appearance.color.title",
    defaultMessage: "Color",
  },
  choosePalette: {
    id: "appearance.palette.open",
    defaultMessage: "Choose palette",
  },
  mode: {
    id: "appearance.mode.label",
    defaultMessage: "Mode",
  },
  modeHint: {
    id: "appearance.mode.hint",
    defaultMessage: "Window material follows this choice.",
  },
  modeLabel: {
    id: "appearance.mode.accessibilityLabel",
    defaultMessage: "Mode",
  },
  system: {
    id: "appearance.mode.system",
    defaultMessage: "System",
  },
  light: {
    id: "appearance.mode.light",
    defaultMessage: "Light",
  },
  dark: {
    id: "appearance.mode.dark",
    defaultMessage: "Dark",
  },
  accentColor: {
    id: "appearance.accent.label",
    defaultMessage: "Accent color",
  },
  accentColorLabel: {
    id: "appearance.accent.accessibilityLabel",
    defaultMessage: "Accent color",
  },
  gray: {
    id: "appearance.gray.label",
    defaultMessage: "Gray",
  },
  grayLabel: {
    id: "appearance.gray.accessibilityLabel",
    defaultMessage: "Gray",
  },
  shape: {
    id: "appearance.shape.title",
    defaultMessage: "Shape",
  },
  cornerRadius: {
    id: "appearance.cornerRadius.label",
    defaultMessage: "Corner radius",
  },
  cornerRadiusLabel: {
    id: "appearance.cornerRadius.accessibilityLabel",
    defaultMessage: "Corner radius",
  },
  square: {
    id: "appearance.cornerRadius.square",
    defaultMessage: "Square",
  },
  small: {
    id: "appearance.cornerRadius.small",
    defaultMessage: "Small",
  },
  medium: {
    id: "appearance.cornerRadius.medium",
    defaultMessage: "Medium",
  },
  large: {
    id: "appearance.cornerRadius.large",
    defaultMessage: "Large",
  },
  density: {
    id: "appearance.density.label",
    defaultMessage: "Density",
  },
  densityHint: {
    id: "appearance.density.hint",
    defaultMessage: "Scales spacing and text together.",
  },
  densityLabel: {
    id: "appearance.density.accessibilityLabel",
    defaultMessage: "Density",
  },
  compact: {
    id: "appearance.density.compact",
    defaultMessage: "Compact",
  },
  standard: {
    id: "appearance.density.standard",
    defaultMessage: "Standard",
  },
  comfortable: {
    id: "appearance.density.comfortable",
    defaultMessage: "Comfortable",
  },
  fonts: {
    id: "appearance.fonts.title",
    defaultMessage: "Fonts",
  },
  fontsHint: {
    id: "appearance.fonts.hint",
    defaultMessage: "Markdown uses the interface font for text and the code font for code.",
  },
  interfaceFont: {
    id: "appearance.fonts.interface.label",
    defaultMessage: "Interface font",
  },
  interfaceFontLabel: {
    id: "appearance.fonts.interface.accessibilityLabel",
    defaultMessage: "Interface font",
  },
  codeFont: {
    id: "appearance.fonts.code.label",
    defaultMessage: "Code font",
  },
  terminalFont: {
    id: "appearance.terminalFont",
    defaultMessage: "Terminal font",
  },
  terminalFontSize: {
    id: "appearance.terminalFontSize",
    defaultMessage: "Terminal font size (px)",
  },
  resetTerminalFontSize: {
    id: "appearance.resetTerminalFontSize",
    defaultMessage: "Reset terminal font size",
  },
  codeFontSize: {
    id: "appearance.fonts.code.size",
    defaultMessage: "Code font size (px)",
  },
  resetCodeFontSize: {
    id: "appearance.resetCodeFontSize",
    defaultMessage: "Reset code font size to automatic",
  },
  auto: {
    id: "appearance.fonts.code.autoSize",
    defaultMessage: "Auto",
  },
  codeFontLabel: {
    id: "appearance.fonts.code.accessibilityLabel",
    defaultMessage: "Code font",
  },
  showAllFonts: {
    id: "appearance.fonts.showAll",
    defaultMessage: "Show all fonts",
  },
  canvas: {
    id: "appearance.canvas.title",
    defaultMessage: "Canvas",
  },
  canvasHint: {
    id: "appearance.canvas.hint",
    defaultMessage: "Background texture and connection style of the workbench.",
  },
  edgeStyle: {
    id: "appearance.edgeStyle",
    defaultMessage: "Connection style",
  },
  edgeCurved: {
    id: "appearance.edgeCurved",
    defaultMessage: "Curved",
  },
  edgeStep: {
    id: "appearance.edgeStep",
    defaultMessage: "Right angle",
  },
  edgeSmoothStep: {
    id: "appearance.edgeSmoothStep",
    defaultMessage: "Rounded",
  },
  canvasTexture: {
    id: "appearance.canvas.texture.label",
    defaultMessage: "Canvas texture",
  },
  dots: {
    id: "appearance.canvas.texture.dots",
    defaultMessage: "Dots",
  },
  grid: {
    id: "appearance.canvas.texture.grid",
    defaultMessage: "Grid",
  },
  crosses: {
    id: "appearance.canvas.texture.crosses",
    defaultMessage: "Crosses",
  },
  none: {
    id: "appearance.canvas.texture.none",
    defaultMessage: "None",
  },
  previewNote: {
    id: "appearance.preview.note",
    defaultMessage: "Note",
  },
  previewChecklist: {
    id: "appearance.preview.checklist",
    defaultMessage: "Launch checklist",
  },
  previewRead: {
    id: "appearance.preview.read",
    defaultMessage: "read",
  },
  previewReviewer: {
    id: "appearance.preview.reviewer",
    defaultMessage: "Reviewer",
  },
  previewReady: {
    id: "appearance.preview.ready",
    defaultMessage: "Ready",
  },
  previewResourceCount: {
    id: "appearance.preview.resourceCount",
    defaultMessage: "1 resource attached",
  },
  previewEdit: {
    id: "appearance.preview.edit",
    defaultMessage: "Edit",
  },
  previewRun: {
    id: "appearance.preview.run",
    defaultMessage: "Run",
  },
  paletteLabel: {
    id: "appearance.palette.title",
    defaultMessage: "Choose palette",
  },
  paletteHint: {
    id: "appearance.palette.hint",
    defaultMessage: "Sets the accent color and gray. You can still adjust each afterwards.",
  },
  paletteDusk: {
    id: "appearance.palette.dusk",
    defaultMessage: "Dusk",
  },
  paletteTundra: {
    id: "appearance.palette.tundra",
    defaultMessage: "Tundra",
  },
  paletteSky: {
    id: "appearance.palette.sky",
    defaultMessage: "Clear sky",
  },
  paletteTerracotta: {
    id: "appearance.palette.terracotta",
    defaultMessage: "Terracotta",
  },
  paletteInk: {
    id: "appearance.palette.ink",
    defaultMessage: "Indigo ink",
  },
  paletteGraphite: {
    id: "appearance.palette.graphite",
    defaultMessage: "Graphite",
  },
  paletteLagoon: {
    id: "appearance.palette.lagoon",
    defaultMessage: "Lagoon",
  },
  paletteCeladon: {
    id: "appearance.palette.celadon",
    defaultMessage: "Celadon",
  },
  paletteMeadow: {
    id: "appearance.palette.meadow",
    defaultMessage: "Meadow",
  },
  paletteHoney: {
    id: "appearance.palette.honey",
    defaultMessage: "Honey",
  },
  paletteCoral: {
    id: "appearance.palette.coral",
    defaultMessage: "Coral",
  },
  paletteRose: {
    id: "appearance.palette.rose",
    defaultMessage: "Rose",
  },
}));
