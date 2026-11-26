import { defineMessages } from "@asterism-app/sdk/contracts";
import { builtin } from "@asterism-app/builtin-api/contracts";

export const meshMessages = builtin.messages("en", defineMessages({
  title: { id: "mesh.title", defaultMessage: "Mesh" },
  channels: { id: "mesh.channels", defaultMessage: "Channels" },
  agents: { id: "mesh.agents", defaultMessage: "{count, plural, one {# visible agent} other {# visible agents}}" },
  create: { id: "mesh.create", defaultMessage: "New channel" },
  rename: { id: "mesh.rename", defaultMessage: "Rename channel" },
  delete: { id: "mesh.delete", defaultMessage: "Delete channel" },
  deleteTitle: { id: "mesh.deleteTitle", defaultMessage: "Delete “{title}”?" },
  deleteConfirm: { id: "mesh.deleteConfirm", defaultMessage: "This deletes the channel across all sessions. Mesh resources using it will no longer have a selected channel." },
  disconnected: { id: "mesh.disconnected", defaultMessage: "Not connected to a channel" },
  notConnected: { id: "mesh.notConnected", defaultMessage: "Select or create a channel on the Mesh card to use its tools." },
  name: { id: "mesh.name", defaultMessage: "Channel name" },
  save: { id: "mesh.save", defaultMessage: "Save" },
  cancel: { id: "mesh.cancel", defaultMessage: "Cancel" },
  failed: { id: "mesh.failed", defaultMessage: "The channel could not be updated. Try again." },
  list: { id: "mesh.list", defaultMessage: "List agents" },
  getProfile: { id: "mesh.getProfile", defaultMessage: "Read profile" },
  setProfile: { id: "mesh.setProfile", defaultMessage: "Update profile" },
  empty: { id: "mesh.empty", defaultMessage: "No agents are exposed to this channel." },
  noDescription: { id: "mesh.noDescription", defaultMessage: "No task description" },
}));
