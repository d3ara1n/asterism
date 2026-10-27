/** Author examples and typechecks; import the SDK and optional domain libraries without executing these declarations. */
import { z } from "zod";
import {
  defineModule, definePlugin, observe, prepare, pluginNamespace, implementResource, Session,
  type SessionSnapshot, type SessionRecord, type ResourceWriter, type ResourceContext,
  type CommandServices, type ModelServices, type ResourceRef,
} from "./draft-2026-10-12-plugin-sdk.ts";
import { AgentResource, UserMessage, TextBlock, Submit } from "./draft-2026-10-12-core-contracts.ts";

const filesystem = pluginNamespace("example.filesystem");
const FileRead = filesystem.record("file.read", {
  version: 1, schema: z.strictObject({ path: z.string(), text: z.string() }),
});
const DirectoryResource = filesystem.resource("directory", {
  version: 1, dataSchema: z.strictObject({ path: z.string() }), createSchema: z.strictObject({ path: z.string() }),
  records: { FileRead }, commands: {},
});
const namingNamespace = pluginNamespace("example.naming");
export const namingPlugin = definePlugin({
  namespace: namingNamespace, version: "0.1.0", api: { major: 1, minMinor: 0 },
  modules: [defineModule(() => ({ contributions: [observe({
    id: "name-session", on: Session.Committed,
    async run(event, context) {
      if (!event.records.some(record => UserMessage.decode(record)?.status === "known")) return;
      const first = await event.snapshot.records.first(UserMessage, { scope: "session" });
      if (first?.status !== "known" || !event.records.some(record => record.id === first.id)) return;
      const text: string = first.data.text;
      const expectedVersion = event.snapshot.title.version;
      context.tasks.start({
        key: first.id, timeoutMs: 30_000,
        async run(task) {
          const result = await task.models.generateText({
            target: { role: "utility" },
            system: "Generate a concise session title from the user's first message. Return only the title.",
            input: text, signal: task.signal,
          });
          return task.session.title.propose(result.text, { expectedVersion, cause: first });
        },
      });
    },
  })] }))],
});

export const emptyInputGuard = prepare({
  id: "empty-input", on: Submit,
  run(proposal) {
    return proposal.input.text.trim() ? { action: "accept" } : { action: "reject", code: "empty_input", message: "Enter a message." };
  },
});

// These checks target independent contracts: invalid types, incorrect ownership, and interception of facts must be rejected at compile time.
declare const snapshot: SessionSnapshot;
declare const rawRecord: SessionRecord;
declare const writer: ResourceWriter<typeof AgentResource>;
declare const resourceContext: ResourceContext<typeof AgentResource>;
declare const commands: CommandServices;
declare const agentRef: ResourceRef;
declare const models: ModelServices;
declare const signal: AbortSignal;
const decoded = UserMessage.decode(rawRecord);
if (decoded?.status === "known") {
  const text: string = decoded.data.text;
  void text;
  // @ts-expect-error User messages have no directory file locator fields.
  decoded.data.path;
  // @ts-expect-error Observation results are immutable.
  decoded.data.text = "changed";
}
writer.append(UserMessage, { text: "Hello" });
// @ts-expect-error Invalid payloads cannot bypass validation by inferring the contract from the second argument.
writer.append(UserMessage, { text: 1 });
// @ts-expect-error This resource's writer cannot submit records belonging to other resources.
writer.append(FileRead, { path: "a.txt", text: "Hello" });
// @ts-expect-error Existing facts (records) cannot register pre-entry replacement or rejection; prepare accepts commands only.
prepare({ id: "rewrite-output", on: TextBlock, run: () => ({ action: "accept" }) });
// @ts-expect-error Replacements must conform to the command input contract.
prepare({ id: "wrong-replacement", on: Submit, run: () => ({ action: "replace", data: { text: 1, submissionId: "s" } }) });
// @ts-expect-error Synchronous commits cannot receive asynchronous transaction callbacks.
resourceContext.commit(async () => {});
implementResource(AgentResource, { commands: {
  async Submit(input, context) {
    context.commit(writer => { writer.append(UserMessage, { text: input.text }); });
    return { accepted: true };
  },
} });
implementResource(AgentResource, { commands: {
  // @ts-expect-error Command return values must conform to the output contract.
  Submit: async () => ({ accepted: "yes" }),
} });
const sameShape = filesystem.record("user-message", {
  version: 1, schema: z.strictObject({ text: z.string() }),
});
// @ts-expect-error Different contracts with identically shaped payloads still cannot be submitted across resources.
writer.append(sameShape, { text: "Hello" });
// @ts-expect-error Observation requires contract values, not string event names.
observe({ id: "string-event", on: "session.committed", run() {} });
const committedRef = resourceContext.commit(writer => writer.append(UserMessage, { text: "Hello" }));
const committedId: string = committedRef.id;
void committedId;
async function checkQueries() {
  const first = await snapshot.records.first(UserMessage, { scope: "session" });
  if (first?.status === "known") { const text: string = first.data.text; void text; }
  const directory = await snapshot.resources.get(DirectoryResource, "directory-id");
  if (directory) {
    const path: string = directory.data.path;
    void path;
    // @ts-expect-error Public catalog data has no model selection fields.
    directory.data.selection;
  }
}
void checkQueries;
async function checkInvoke() {
  const output = await commands.invoke(Submit, agentRef, { text: "Hello", submissionId: "s1" });
  const accepted: boolean = output.accepted;
  void accepted;
  // @ts-expect-error The contract determines command input.
  await commands.invoke(Submit, agentRef, { text: 1, submissionId: "s1" });
  // @ts-expect-error String addresses are not accepted; cross-plugin calls require a command contract.
  await commands.invoke("atelier.core/agent.submit", agentRef, { text: "Hello", submissionId: "s1" });
  // @ts-expect-error Record contracts cannot be used as commands.
  await commands.invoke(UserMessage, agentRef, { text: "Hello" });
}
void checkInvoke;

// The model service consumes only SDK model protocol types; no resource or domain configuration is required.
models.stream({ target: { role: "default" }, system: "Answer briefly.", messages: [{ kind: "input", text: "Hello" }], signal });
void models.run({
  signal, maxRequests: 1,
  async environment() { return { target: { role: "default" }, system: "Answer briefly.", messages: [{ kind: "input", text: "Hello" }] }; },
  onEvent(event) { const requestId: string = event.requestId; void requestId; },
});
async function checkRun() {
  const outcome = await models.run({
    signal, maxRequests: 1,
    async environment() {
      return { target: { role: "default" }, system: "s", messages: [], executor: {
        async execute(call) { return { status: "unknown", reason: "interrupted" } as const; },
      } };
    },
    onEvent() {},
  });
  if (outcome.status === "failed") { const code: string = outcome.code; void code; }
}
void checkRun;
