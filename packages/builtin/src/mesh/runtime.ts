import { nanoid } from "nanoid";
import { defineModule, implementAction, implementCreation, implementResource, implementTool, PluginApiError,
  type ObjectReader, type ObjectExecutor, type ToolContribution } from "@asterism-app/sdk/runtime";
import { builtin, peekToModel, SubmitAgentInput } from "@asterism-app/builtin-api/contracts";
import { agentServices } from "@asterism-app/builtin-api/runtime";
import { meshMessages } from "../messages/mesh.ts";
import { meshCard } from "../shared/card-appearance.ts";
import { CreateMesh, CreateMeshChannel, DeleteMeshChannel, Mesh, MeshGetProfile, MeshList, MeshPeek,
  MeshSend, MeshSetProfile, MeshState, MeshView, RenameMeshChannel, SelectMeshChannel } from "./contract.ts";
import { MeshService, type MeshAccess } from "./service.ts";
import { memberKey } from "./members.ts";

const notConnected = { kind: "failed", error: {
  code: "mesh_channel_not_connected",
  message: "This Mesh is not connected to a channel. Select or create a channel on the Mesh card.",
  display: meshMessages.notConnected,
} } as const;

export default defineModule(plugin => {
  const service = new MeshService(plugin);
  // Description-only catalog queries do not bind access; each model request captures it before model execution.
  const capturedTool = (create: (access?: MeshAccess | null) => ToolContribution): ToolContribution => ({
    ...create(), capture: (_resource, object) => create(service.capture(object)),
  });
  // Null is a captured disconnected state; only uncaptured calls resolve live access.
  const accessOf = (access: MeshAccess | null | undefined, object: ObjectReader) =>
    access === undefined ? service.capture(object) : access;
  const select = (object: ObjectExecutor, channelId: string) => {
    service.requireChannel(channelId);
    object.commit(writer => { writer.set(MeshState, { channelId, profiles: service.state(object)?.profiles ?? {} }); });
    service.refresh();
  };
  return {
    observers: [{ id: builtin.name("mesh.members"), cursorChanged() { service.refresh(); } }],
    resources: [implementResource(Mesh, MeshView, {
      card: meshCard, links: { receive: true },
      creation: implementCreation(CreateMesh, { create: () => ({ title: "Mesh", data: {} }) }),
      attach(_data, object, lifetime) {
        service.attach(object.ref.id);
        lifetime.signal.addEventListener("abort", () => service.detach(object.ref.id), { once: true });
      },
      project: (_data, object) => service.view(object),
      inspect: async (_data, object) => ({
        channel: service.channel(object)?.title ?? null,
        description: "Mesh tools require a selected channel. Agents exposed to that channel can be listed, messaged, and investigated by title and numeric name disambiguator. Your task description belongs to this Mesh resource.",
      }),
      actions: [
        implementAction(SelectMeshChannel, { async execute({ channelId }, object) { select(object, channelId); } }),
        implementAction(CreateMeshChannel, { async execute({ title }, object) { select(object, service.createChannel(title)); } }),
        implementAction(RenameMeshChannel, { async execute({ channelId, title }) { service.renameChannel(channelId, title); } }),
        implementAction(DeleteMeshChannel, { async execute({ channelId }) { service.deleteChannel(channelId); } }),
      ],
    })],
    tools: [
      capturedTool(access => implementTool(MeshList, {
        async call(_data, _target, _args, { object }) {
          const captured = accessOf(access, object);
          if (!captured) return notConnected;
          return { kind: "succeeded", data: { agents: captured.members.map(member => service.profile(member)), truncated: false } };
        },
      })),
      capturedTool(access => implementTool(MeshGetProfile, {
        async call(_data, target, _args, { object, caller }) {
          const captured = accessOf(access, object);
          if (!captured) return notConnected;
          return { kind: "succeeded", data: target === null ? service.ownProfile(object, caller, captured) : service.profile(service.resolve(captured, target)) };
        },
      })),
      capturedTool(access => implementTool(MeshSetProfile, {
        async call(_data, _target, { description }, { object, caller }) {
          if (!accessOf(access, object)) return notConnected;
          // The Agent domain validates the caller; the model cannot select another profile owner.
          agentServices(plugin).describe(caller.ref);
          object.commit(writer => {
            const state = service.state(object);
            if (!state) throw new PluginApiError("unavailable", "The Mesh state is unavailable.");
            const profiles = { ...state.profiles }, key = memberKey(caller.ref);
            if (description) profiles[key] = description; else delete profiles[key];
            writer.set(MeshState, { ...state, profiles });
          });
          service.refresh();
          return { kind: "succeeded", data: { description } };
        },
      })),
      capturedTool(access => implementTool(MeshSend, {
        async call(_data, target, args, { object, caller, signal }) {
          const captured = accessOf(access, object);
          if (!captured) return notConnected;
          const recipient = service.resolve(captured, target);
          const sender = captured.members.find(member => memberKey(member.ref) === memberKey(caller.ref));
          await plugin.session(recipient.ref.sessionId).invoke(SubmitAgentInput, recipient.ref, {
            submissionId: nanoid(16), mode: "steer", parts: args.parts,
            sender: { kind: "agent", resource: { ...caller.ref }, name: caller.title,
              mesh: { channel: captured.channelName, id: sender?.profile.id ?? null } },
          }, { signal });
          return { kind: "succeeded", data: { name: recipient.profile.title } };
        },
      })),
      capturedTool(access => implementTool(MeshPeek, {
        async call(_data, target, args, { object, signal, publish }) {
          const captured = accessOf(access, object);
          if (!captured) return notConnected;
          return agentServices(plugin).peek(service.resolve(captured, target).ref).run(args, { signal, onProgress: publish });
        },
        toModel: peekToModel,
      })),
    ],
  };
});
