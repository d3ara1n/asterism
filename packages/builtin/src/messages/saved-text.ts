import { defineMessages } from "@asterism-app/sdk/contracts";
import { builtin } from "@asterism-app/builtin-api/contracts";

export const savedTextMessages = builtin.messages("en", defineMessages({
  title: { id: "savedText.title", defaultMessage: "Saved text" },
  summary: { id: "savedText.summary", defaultMessage: "Reusable messages" },
  add: { id: "savedText.add", defaultMessage: "Add saved text" },
  newItem: { id: "savedText.newItem", defaultMessage: "New saved text" },
  empty: { id: "savedText.empty", defaultMessage: "No saved text" },
  name: { id: "savedText.name", defaultMessage: "Name" },
  content: { id: "savedText.content", defaultMessage: "Content" },
  characters: { id: "savedText.characters", defaultMessage: "{count, number} / {limit, number}" },
  deleteTitle: { id: "savedText.deleteTitle", defaultMessage: "Delete {name}?" },
  deleteDescription: { id: "savedText.deleteDescription", defaultMessage: "This cannot be undone." },
  insert: { id: "savedText.insert", defaultMessage: "Insert saved text" },
  saveInput: { id: "savedText.saveInput", defaultMessage: "Save input as saved text" },
  saved: { id: "savedText.saved", defaultMessage: "Saved as {name}" },
  search: { id: "savedText.search", defaultMessage: "Search saved text…" },
}));
