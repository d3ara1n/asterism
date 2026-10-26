import { defineMessages, pluginNamespace } from "@asterism/sdk/contracts";

export const objectsMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
  auxiliaryPanels: { id: "objects.auxiliaryPanels", defaultMessage: "Auxiliary panels" },
  openInIsland: { id: "objects.openInIsland", defaultMessage: "Open in island" },
  returnToCard: { id: "objects.returnToCard", defaultMessage: "Return to card" },
  focusedInIsland: { id: "objects.focusedInIsland", defaultMessage: "This content is open in the focus island." },
  focusIsland: { id: "objects.focusIsland", defaultMessage: "Focus" },
  closeAuxiliaryPanel: { id: "objects.closeAuxiliaryPanel", defaultMessage: "Close panel" },
  objectActions: {
    id: "objectActions",
    defaultMessage: "Object actions",
  },
  objects: {
    id: "objects",
    defaultMessage: "Objects",
  },
  noObjects: {
    id: "noObjects",
    defaultMessage: "There are no objects in this conversation.",
  },
  kindResource: {
    id: "kindResource",
    defaultMessage: "Resource",
  },
  kindMissing: {
    id: "kindMissing",
    defaultMessage: "Unavailable ({plugin} not installed or disabled)",
  },
  focusSelection: {
    id: "focusSelection",
    defaultMessage: "Focus selection",
  },
  cardSize: {
    id: "cardSize",
    defaultMessage: "Card size",
  },
  resizeCard: {
    id: "resizeCard",
    defaultMessage: "Drag to resize",
  },
  cardSizeLarge: {
    id: "cardSizeLarge",
    defaultMessage: "Large",
  },
  cardSizeExtraLarge: {
    id: "cardSizeExtraLarge",
    defaultMessage: "Extra large",
  },
  restoreCardSize: {
    id: "restoreCardSize",
    defaultMessage: "Restore default size",
  },
  removeObjectTitle: {
    id: "removeObjectTitle",
    defaultMessage: "Remove this object?",
  },
  removeObjectDescription: {
    id: "removeObjectDescription",
    defaultMessage: "“{title}” will be removed from this session. Its card and links are removed too.",
  },
  removeObject: {
    id: "removeObject",
    defaultMessage: "Remove {title}",
  },
  searchObjects: {
    id: "searchObjects",
    defaultMessage: "Find an object",
  },
  searchResources: {
    id: "searchResources",
    defaultMessage: "Find a resource",
  },
  hiddenObjects: {
    id: "hiddenObjects",
    defaultMessage: "Hidden",
  },
  cardHidden: {
    id: "cardHidden",
    defaultMessage: "Card hidden",
  },
  hideCard: {
    id: "objects.hideCard",
    defaultMessage: "Hide card for {title}",
  },
  showCard: {
    id: "objects.showCard",
    defaultMessage: "Show card for {title}",
  },
  locateObject: {
    id: "locateObject",
    defaultMessage: "Locate {title}",
  },
  objectStillActive: {
    id: "objectStillActive",
    defaultMessage: "Wait for this object’s activity to finish before removing it.",
  },
}));
