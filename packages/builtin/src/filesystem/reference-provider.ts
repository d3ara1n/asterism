import type { ReferenceTargetProvider } from "@asterism-app/sdk/renderer";
import { filesystemMessages } from "../messages/filesystem.ts";
import type { SearchDirectoryReferences } from "./search-contract.ts";

export function fileReferenceProvider(contract: typeof SearchDirectoryReferences): ReferenceTargetProvider {
  return {
    kind: "search",
    prompt: filesystemMessages.referenceSearchHint,
    refineHint: filesystemMessages.referenceSearchLimited,
    async search(query, { calls, resource, signal }) {
      const { paths, limited } = await calls.invoke(contract, { query }, { object: resource, signal });
      return { limited, items: paths.map(location => {
        const separator = location.lastIndexOf("/");
        return { label: location.slice(separator + 1), detail: separator < 0 ? undefined : location.slice(0, separator + 1), location };
      }) };
    },
  };
}
