import { defineMessages, type PluginMetadata } from "@asterism-app/sdk/contracts";
import { builtin } from "@asterism-app/builtin-api/contracts";
import pkg from "../package.json" with { type: "json" };

const messages = builtin.messages("en", defineMessages({
  name: { id: "plugin.name", defaultMessage: "Asterism Essentials" },
  description: { id: "plugin.description", defaultMessage: "Agents, conversations, notes, files and interactive tools." },
}));
export const builtinMetadata: PluginMetadata = { name: messages.name, description: messages.description, version: pkg.version, author: "Asterism" };
