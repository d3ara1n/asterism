import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";

export const templateMessages = pluginNamespace("atelier.host").messages("en", defineMessages({
  templates: { id: "templates.title", defaultMessage: "Templates" },
  saveAs: { id: "templates.saveAs", defaultMessage: "Save as template" },
  description: { id: "templates.description", defaultMessage: "Save object data, links, and arrangement for new conversations. Conversation history and running instances are excluded." },
  name: { id: "templates.name", defaultMessage: "Template name" },
  objects: { id: "templates.objects", defaultMessage: "Objects" },
  objectCount: { id: "templates.objectCount", defaultMessage: "{count, plural, one {# object} other {# objects}}" },
  info: { id: "templates.info", defaultMessage: "Template information" },
  actions: { id: "templates.actions", defaultMessage: "Template actions" },
  created: { id: "templates.created", defaultMessage: "Created {time, date, medium} at {time, time, short}" },
  empty: { id: "templates.empty", defaultMessage: "Save a conversation as a template from its menu to start with your objects and connections." },
  noObjects: { id: "templates.noObjects", defaultMessage: "This conversation has no objects to save." },
  loading: { id: "templates.loading", defaultMessage: "Loading objects…" },
  starting: { id: "templates.starting", defaultMessage: "Creating conversation…" },
  delete: { id: "templates.delete", defaultMessage: "Delete template" },
  deleteDescription: { id: "templates.deleteDescription", defaultMessage: "Delete \u201c{title}\u201d? Conversations created from this template are kept." },
  unavailable: { id: "templates.unavailable", defaultMessage: "A resource type required by this template is unavailable. Enable its plugin and try again." },
  invalidData: { id: "templates.invalidData", defaultMessage: "Saved object data does not match the installed resource type." },
  sourceChanged: { id: "templates.sourceChanged", defaultMessage: "A selected object is no longer in this conversation. Reopen the save dialog to choose the current objects." },
}));
