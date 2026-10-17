import { defineMessages, type PluginMetadata } from "@atelier/sdk/contracts";
import { builtin } from "@atelier/builtin-api/contracts";
import pkg from "../package.json" with { type: "json" };

const messages = builtin.messages("en", defineMessages({
  name: { id: "plugin.name", defaultMessage: "Atelier Essentials" },
  description: { id: "plugin.description", defaultMessage: "Agents, conversations, notes, files and interactive tools." },
}));
export const builtinMetadata: PluginMetadata = { name: messages.name, description: messages.description, version: pkg.version, author: "Atelier" };
