import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const accessMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
  access: {
    id: "access.title",
    defaultMessage: "Access",
  },
  accessLabel: {
    id: "access.label",
    defaultMessage: "Resource access",
  },
  accessEmpty: {
    id: "access.empty",
    defaultMessage: "Add a resource that receives links and another resource to manage access.",
  },
  byReceiver: {
    id: "access.byReceiver",
    defaultMessage: "By receiver",
  },
  byResource: {
    id: "access.byResource",
    defaultMessage: "By resource",
  },
  accessRecipient: {
    id: "access.recipient",
    defaultMessage: "Resource receiving access",
  },
  accessTarget: {
    id: "access.target",
    defaultMessage: "Resource being accessed",
  },
  canAccess: {
    id: "access.canAccess",
    defaultMessage: "{title} can access",
  },
  accessibleBy: {
    id: "access.accessibleBy",
    defaultMessage: "Resources with access to {title}",
  },
  linked: {
    id: "access.linked",
    defaultMessage: "Linked",
  },
  notLinked: {
    id: "access.notLinked",
    defaultMessage: "Not linked",
  },
  changeAccess: {
    id: "access.change",
    defaultMessage: "{receiver}: access to {resource}",
  },
  accessSaved: {
    id: "access.saved",
    defaultMessage: "Access updated.",
  },
  accessRequestBoundary: {
    id: "access.requestBoundary",
    defaultMessage: "Requests already in progress keep their original access. Subsequent requests use the updated links.",
  },
  accessRules: {
    id: "access.rules",
    defaultMessage: "Links are directional. Resource tools must also be supported and allowed by the receiver’s tool policy. Hiding a card does not revoke access.",
  },
}));
