import type { ConfigurationService } from "../configuration/service.ts";
import { AgentConfigurations } from "@atelier/builtin-api/contracts";
import type { CatalogHost } from "../plugins/host.ts";

/** 应用配置投影为内置插件的领域目录，模型执行模块不持有 Agent 配置知识。 */
export function createBuiltinCatalogs(configuration: ConfigurationService): CatalogHost {
  return { get: contract => Object.is(contract, AgentConfigurations)
    ? contract.schema.parse(structuredClone(configuration.current().agents)) : null };
}
