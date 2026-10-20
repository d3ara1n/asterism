import type { RendererModule } from "@atelier/sdk/renderer";
import { agentUI } from "@atelier/builtin-api/renderer";
import { builtin } from "@atelier/builtin-api/contracts";
import { UsageToolbarItem } from "./Toolbar";

export default {
  resources: [], cards: [], tools: [],
  async prepare({ signal }) {
    agentUI.register({ id: builtin.name("usage.toolbar"), Component: UsageToolbarItem }, { signal });
  },
} satisfies RendererModule;
