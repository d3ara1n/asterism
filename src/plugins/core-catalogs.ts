import type { ConfigurationService } from "../configuration/service.ts";
import { AgentConfigurations } from "../modules/agent/configuration.ts";
import type { CatalogHost } from "./host.ts";

/** 应用配置投影为 core 的领域目录，模型执行模块不持有 Agent 配置知识。 */
export function createCoreCatalogs(configuration: ConfigurationService): CatalogHost {
  return { get: contract => Object.is(contract, AgentConfigurations)
    ? contract.schema.parse(structuredClone(configuration.current().agents)) : null };
}
