import { ApplicationService } from "../../../src/runtime/service.ts";
import builtin from "./runtime.ts";
import storage from "./storage.ts";
import { UpdateParadigmConfiguration, type ConfigurationOperation } from "./configuration/contract.ts";

/** Tests opt into the bundled paradigm through ordinary plugin definitions and storage declarations. */
export class BuiltinApplicationService extends ApplicationService {
  constructor(root: string, options: NonNullable<ConstructorParameters<typeof ApplicationService>[1]> = {}) {
    super(root, {
      ...options,
      plugins: [builtin, ...options.plugins ?? []],
      preparedStorage: {
        declarations: new Map([[builtin.namespace.id, storage], ...options.preparedStorage?.declarations ?? []]),
        failures: options.preparedStorage?.failures ?? new Map(),
      },
    });
  }
}
export function configureBuiltin(service: ApplicationService, input: ConfigurationOperation) {
  return service.sessions.calls.invoke(UpdateParadigmConfiguration.id, input, {}, null);
}
