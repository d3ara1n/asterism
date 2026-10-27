import type { ConfigurationService } from "../configuration/service.ts";
import { AgentConfigurations } from "@asterism-app/builtin-api/contracts";
import type { CatalogHost } from "../plugins/host.ts";

/** Project application configuration into built-in domain catalogs; model execution modules know nothing about Agent configuration. */
export function createBuiltinCatalogs(configuration: ConfigurationService): CatalogHost {
  return { get: contract => Object.is(contract, AgentConfigurations)
    ? contract.schema.parse(structuredClone(configuration.current().agents)) : null };
}
