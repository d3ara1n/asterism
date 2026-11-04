import { Suspense, type ComponentType } from "react";
import { IslandPanel, type RendererResourceOpener } from "@asterism-app/sdk/renderer";
import type { ResourceRef } from "@asterism-app/sdk/contracts";
import { Spinner } from "@asterism-app/ui/ui/spinner";

/** File resources choose their viewer; every entry shares island identity and close coordination. */
export function fileOpener(FileView: ComponentType<{ resource: ResourceRef; path: string }>): RendererResourceOpener {
  return (path, { resource, island, origin }) => island.open({
    key: `file:${resource.sessionId}:${resource.id}:${path}`, label: path, size: "content", origin,
    render: () => <Suspense fallback={<IslandPanel title={path}><Spinner /></IslandPanel>}>
      <FileView key={path} resource={resource} path={path} />
    </Suspense>,
  });
}
