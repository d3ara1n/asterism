import type { RendererModule } from "@asterism-app/sdk/renderer";
import { agentUI } from "@asterism-app/builtin-api/renderer";
import { builtin } from "@asterism-app/builtin-api/contracts";
import { UsageToolbarItem } from "./Toolbar";

export default {
  resources: [], cards: [], tools: [],
  async prepare({ signal }) {
    agentUI.register({ id: builtin.name("usage.toolbar"), Component: UsageToolbarItem }, { signal });
  },
} satisfies RendererModule;
