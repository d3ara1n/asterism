import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";

export const accessMessages = pluginNamespace("atelier.host").messages("en", defineMessages({
  access: {
    id: "access",
    defaultMessage: "Access",
  },
  accessLabel: {
    id: "accessLabel",
    defaultMessage: "Resource access",
  },
  accessEmpty: {
    id: "accessEmpty",
    defaultMessage: "Add a resource that receives links and another resource to manage access.",
  },
  byReceiver: {
    id: "byReceiver",
    defaultMessage: "By receiver",
  },
  byResource: {
    id: "byResource",
    defaultMessage: "By resource",
  },
  accessRecipient: {
    id: "accessRecipient",
    defaultMessage: "Resource receiving access",
  },
  accessTarget: {
    id: "accessTarget",
    defaultMessage: "Resource being accessed",
  },
  canAccess: {
    id: "canAccess",
    defaultMessage: "{title} can access",
  },
  accessibleBy: {
    id: "accessibleBy",
    defaultMessage: "Resources with access to {title}",
  },
  linked: {
    id: "linked",
    defaultMessage: "Linked",
  },
  notLinked: {
    id: "notLinked",
    defaultMessage: "Not linked",
  },
  changeAccess: {
    id: "changeAccess",
    defaultMessage: "{receiver}: access to {resource}",
  },
  accessSaved: {
    id: "accessSaved",
    defaultMessage: "Access updated.",
  },
  accessSuperseded: {
    id: "accessSuperseded",
    defaultMessage: "The current path has changed.",
  },
  accessRequestBoundary: {
    id: "accessRequestBoundary",
    defaultMessage: "Requests already in progress keep their original access. Subsequent requests use the updated links.",
  },
  accessRules: {
    id: "accessRules",
    defaultMessage: "Links are directional. Resource tools must also be supported and allowed by the receiver’s tool policy. Hiding a card does not revoke access.",
  },
}));
