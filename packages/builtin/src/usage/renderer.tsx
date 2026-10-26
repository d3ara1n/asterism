import type { RendererModule } from "@asterism/sdk/renderer";
import { agentUI } from "@asterism/builtin-api/renderer";
import { builtin } from "@asterism/builtin-api/contracts";
import { UsageToolbarItem } from "./Toolbar";

export default {
  resources: [], cards: [], tools: [],
  async prepare({ signal }) {
    agentUI.register({ id: builtin.name("usage.toolbar"), Component: UsageToolbarItem }, { signal });
  },
} satisfies RendererModule;
