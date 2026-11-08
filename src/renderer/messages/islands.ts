import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const islandsMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
  alreadyOpen: { id: "islands.alreadyOpen", defaultMessage: "Already open in another island" },
  actions: { id: "islands.actions", defaultMessage: "Island actions" },
  size: { id: "islands.size", defaultMessage: "Island size" },
  sizeSmall: { id: "islands.sizeSmall", defaultMessage: "Small" },
  sizeMedium: { id: "islands.sizeMedium", defaultMessage: "Medium" },
  sizeLarge: { id: "islands.sizeLarge", defaultMessage: "Large" },
  restoreSize: { id: "islands.restoreSize", defaultMessage: "Restore default size" },
  moveLeft: { id: "islands.moveLeft", defaultMessage: "Swap with left island" },
  moveRight: { id: "islands.moveRight", defaultMessage: "Swap with right island" },
}));
