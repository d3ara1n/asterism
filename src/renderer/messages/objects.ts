import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const objectsMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
  renameObject: { id: "objects.rename", defaultMessage: "Rename resource" },
  renameObjectDescription: { id: "objects.rename.description", defaultMessage: "Set the resource title shown on its card and in resource lists." },
  objectTitle: { id: "objects.title", defaultMessage: "Title" },
  auxiliaryPanels: { id: "objects.auxiliaryPanels", defaultMessage: "Auxiliary panels" },
  openInIsland: { id: "objects.openInIsland", defaultMessage: "Open in island" },
  returnToCard: { id: "objects.returnToCard", defaultMessage: "Return to card" },
  focusedInIsland: { id: "objects.focusedInIsland", defaultMessage: "This content is open in the focus island." },
  focusIsland: { id: "objects.focusIsland", defaultMessage: "Focus" },
  focusActions: { id: "objects.focusActions", defaultMessage: "Focus island actions" },
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
    defaultMessage: "Drag to resize; double-click to restore default size",
  },
  cardSizeSmall: {
    id: "cardSizeSmall",
    defaultMessage: "Small",
  },
  cardSizeMedium: {
    id: "cardSizeMedium",
    defaultMessage: "Medium",
  },
  cardSizeLarge: {
    id: "cardSizeLarge",
    defaultMessage: "Large",
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
