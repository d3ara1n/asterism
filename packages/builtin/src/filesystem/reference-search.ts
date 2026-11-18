import { PluginApiError } from "@asterism-app/sdk/runtime";
import { filesystemFailure } from "./errors.ts";
import { searchScope } from "./search.ts";
import { referencePathOutput } from "./search-output.ts";
import { referencePathArguments, runSearch } from "./search-process.ts";

export async function searchReferencePaths(scopes: readonly { root: string; prefix: string }[], query: string, signal: AbortSignal) {
  let prefix = "";
  const { result, records } = referencePathOutput(() => prefix, query);
  try {
    for (const scope of scopes) {
      signal.throwIfAborted();
      const { cwd, operand } = await searchScope(scope.root, ".", true);
      prefix = scope.prefix;
      result.stopReason = await runSearch(cwd, referencePathArguments(operand), records, signal);
      if (result.stopReason !== null) break;
    }
    return { paths: result.files, limited: result.stopReason !== null };
  } catch (error) {
    signal.throwIfAborted();
    const { error: failure } = filesystemFailure(error, "Find reference paths");
    throw new PluginApiError("unavailable", failure.message, failure.code);
  }
}
