import { defineMessages } from "@asterism-app/sdk/contracts";
import { builtin } from "@asterism-app/builtin-api/contracts";

export const meshMessages = builtin.messages("en", defineMessages({
  title: { id: "mesh.title", defaultMessage: "Mesh" },
  channels: { id: "mesh.channels", defaultMessage: "Channels" },
  agents: { id: "mesh.agents", defaultMessage: "{count, plural, one {# visible agent} other {# visible agents}}" },
  create: { id: "mesh.create", defaultMessage: "New channel" },
  rename: { id: "mesh.rename", defaultMessage: "Rename channel" },
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
