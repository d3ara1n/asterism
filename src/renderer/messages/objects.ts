import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const objectsMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
  resourceMissing: { id: "objects.resourceMissing", defaultMessage: "Resource does not exist." },
  resourceOpenUnsupported: { id: "objects.resourceOpenUnsupported", defaultMessage: "This resource does not support opening locations." },
  resourceOpenFailed: { id: "objects.resourceOpenFailed", defaultMessage: "Could not open resource." },
  resourceRetiring: { id: "objects.retiring", defaultMessage: "Removed. Waiting for ongoing work to finish." },
  linkHolds: { id: "objects.linkHolds", defaultMessage: "Disconnected. {count, plural, one {# request still uses this link} other {# requests still use this link}}." },
  renameObject: { id: "objects.rename", defaultMessage: "Rename resource" },
  renameObjectDescription: { id: "objects.rename.description", defaultMessage: "Set the resource title shown on its card and in resource lists." },
  objectTitle: { id: "objects.title", defaultMessage: "Title" },
  auxiliaryPanels: { id: "objects.auxiliaryPanels", defaultMessage: "Auxiliary panels" },
  openInIsland: { id: "objects.openInIsland", defaultMessage: "Open in island" },
  returnToCard: { id: "objects.returnToCard", defaultMessage: "Return to card" },
  openedInIsland: { id: "objects.openedInIsland", defaultMessage: "This content is open in an island." },
  closeAuxiliaryPanel: { id: "objects.closeAuxiliaryPanel", defaultMessage: "Close panel" },
  objectActions: {
    id: "objects.actions",
    defaultMessage: "Object actions",
  },
  objects: {
    id: "objects.heading",
    defaultMessage: "Objects",
  },
  noObjects: {
    id: "objects.empty",
    defaultMessage: "There are no objects in this conversation.",
  },
  kindResource: {
    id: "objects.kind.resource",
    defaultMessage: "Resource",
  },
  kindMissing: {
    id: "objects.kind.unavailable",
    defaultMessage: "Unavailable ({plugin} not installed or disabled)",
  },
  focusSelection: {
    id: "objects.focusSelection",
    defaultMessage: "Focus selection",
  },
  cardSize: {
    id: "objects.card.size.label",
    defaultMessage: "Card size",
  },
  resizeCard: {
    id: "objects.card.resizeHint",
    defaultMessage: "Drag to resize; double-click to restore default size",
  },
  cardSizeSmall: {
    id: "objects.card.size.small",
    defaultMessage: "Small",
  },
  cardSizeMedium: {
    id: "objects.card.size.medium",
    defaultMessage: "Medium",
  },
  cardSizeLarge: {
    id: "objects.card.size.large",
    defaultMessage: "Large",
  },
  restoreCardSize: {
    id: "objects.card.size.restore",
    defaultMessage: "Restore default size",
  },
  removeObjectTitle: {
    id: "objects.remove.title",
    defaultMessage: "Remove this object?",
  },
  removeObjectDescription: {
    id: "objects.remove.description",
    defaultMessage: "“{title}” will be removed from this session. Its card and links are removed too.",
  },
  removeObject: {
    id: "objects.remove.label",
    defaultMessage: "Remove {title}",
  },
  searchObjects: {
    id: "objects.search",
    defaultMessage: "Find an object",
  },
  searchResources: {
    id: "objects.resources.search",
    defaultMessage: "Find a resource",
  },
  hiddenObjects: {
    id: "objects.hidden",
    defaultMessage: "Hidden",
  },
  cardHidden: {
    id: "objects.card.hidden",
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
    id: "objects.locate",
    defaultMessage: "Locate {title}",
  },
  objectStillActive: {
    id: "objects.remove.stillActive",
    defaultMessage: "Wait for this object’s activity to finish before removing it.",
  },
}));
