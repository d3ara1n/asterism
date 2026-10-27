import { belongsTo, jsonSchema, type CallContract, type CallOptions, type Json, type PluginCalls, type ResourceRef, type Source } from "@asterism-app/sdk/contracts";
import { PluginApiError, type CallContribution } from "@asterism-app/sdk/runtime";
import type { SdkContext } from "./sdk-context.ts";
import type { RunGroup } from "./lifecycle.ts";
import type { PluginHostServices } from "./loader.ts";

/** Calls route by contract independently of resource action queues; object association grants no access to private data. */
export class CallRegistry {
  private entries = new Map<string, { owner: string; contribution: CallContribution; sdk: SdkContext; runs: RunGroup }>();
  constructor(private readonly host: PluginHostServices) {}
  declare(owner: string, contribution: CallContribution, sdk: SdkContext, runs: RunGroup) {
    if (!belongsTo(owner, contribution.contract.id)) throw new PluginApiError("foreign_resource", "The call belongs to another plugin.");
    if (this.entries.has(contribution.contract.id)) throw new PluginApiError("conflict", `Duplicate call: ${contribution.contract.id}`);
    this.entries.set(contribution.contract.id, { owner, contribution, sdk, runs });
  }
  removeOwner(owner: string) {
    for (const [id, entry] of this.entries) if (entry.owner === owner) this.entries.delete(id);
  }
  async invoke(id: string, input: Json, options: CallOptions, source: Source, contract?: CallContract): Promise<Json> {
    const entry = this.entries.get(id);
    if (!entry) throw new PluginApiError("unavailable", "The plugin call is unavailable.");
    if (contract && contract !== entry.contribution.contract) throw new PluginApiError("invalid_argument", "Use the declared call contract instance.");
    let ref: ResourceRef | undefined;
    if (entry.contribution.contract.scope === "object") {
      if (!options.object) throw new PluginApiError("invalid_argument", "The call requires an associated object.");
      ref = Object.freeze({ ...options.object });
      const actual = this.host.refOf(ref.id);
      if (!actual || actual.kind !== ref.kind || actual.sessionId !== ref.sessionId ||
        !this.host.sessions.workbench(ref.sessionId).objects.some(object => object.id === ref!.id))
        throw new PluginApiError("unavailable", "The associated object is not on the current session path.");
    } else if (options.object) throw new PluginApiError("invalid_argument", "A plugin call cannot bind an object.");
    const parsed = entry.contribution.contract.input.safeParse(jsonSchema.parse(input));
    if (!parsed.success) throw new PluginApiError("invalid_argument", parsed.error.message);
    return entry.runs.start(async signal => {
      signal.throwIfAborted();
      const scope = { active: true, execution: true };
      try {
        const result = await entry.contribution.execute(jsonSchema.parse(parsed.data), {
          ...(ref ? { object: entry.sdk.reader(ref, scope) } : {}), source: structuredClone(source), signal,
        });
        signal.throwIfAborted();
        // Return raw JSON; recipients decode using their own copy of the same contract so transforming schemas do not apply twice.
        const wire = jsonSchema.parse(result);
        entry.contribution.contract.output.parse(wire);
        return wire;
      } finally { scope.active = false; }
    }, { object: ref, signal: options.signal, affectsHistory: false }).done;
  }
  client(owner: string, runs: RunGroup): PluginCalls {
    return { invoke: (contract, input, options) => runs.start(async signal => {
      const result = await this.invoke(contract.id, input, { ...options, signal }, { plugin: owner, resource: null }, contract);
      return contract.output.parse(result);
    }, { object: options.object, signal: options.signal, affectsHistory: false }).done };
  }
}
