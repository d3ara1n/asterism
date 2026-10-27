import { present, type DataContract, type Json } from "@asterism-app/sdk/contracts";
import { PluginApiError } from "@asterism-app/sdk/runtime";

/** Convert encoding failures into the host's write-boundary error without losing contract identity. */
export function encodePluginData<T extends Json>(contract: DataContract<T>, value: T): Json {
  try { return present(contract, value).data; }
  catch (error) {
    if (error instanceof PluginApiError) throw error;
    throw new PluginApiError("invalid_argument", error instanceof Error ? error.message : String(error));
  }
}
