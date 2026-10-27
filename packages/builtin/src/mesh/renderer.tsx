import { List, Network, UserRound, UserRoundPen } from "lucide-react";
import { cardRenderer, creationEntry, toolRenderer, useI18n, type RendererModule, type ToolRenderProps } from "@asterism-app/sdk/renderer";
import { ToolHeader } from "@asterism-app/ui/tool-header";
import { MeshCard } from "./MeshCard";
import { CreateMesh, Mesh, MeshGetProfile, MeshList, MeshPeek, MeshSend, MeshSetProfile, MeshView } from "./contract";
import { meshCard as appearance } from "../shared/card-appearance";
import { meshMessages as messages } from "../messages/mesh";
import { peekViews } from "../shared/peek-view";
import { sendViews } from "../shared/send-view";
import { inputText } from "../shared/tool-preview";

type Profile = { title: string; id: number | null; type: string; descriptions: string[] };
function Profiles({ profiles }: { profiles: Profile[] }) {
  const i18n = useI18n();
  if (!profiles.length) return <p className="type-caption">{i18n.text(messages.empty)}</p>;
  return <ul className="flex flex-col gap-2">
    {profiles.map(profile => <li key={JSON.stringify([profile.title, profile.id])} className="flex min-w-0 flex-col gap-0.5">
      <p className="type-body break-words">{profile.title}{profile.id ? ` [${profile.id}]` : ""}<span className="type-caption"> · {profile.type}</span></p>
      {profile.descriptions.length ? profile.descriptions.map(description => <p key={description} className="type-caption whitespace-pre-wrap break-words">{description}</p>)
        : <p className="type-caption">{i18n.text(messages.noDescription)}</p>}
    </li>)}
  </ul>;
}
function ListResult({ result }: ToolRenderProps<{ agents: Profile[]; truncated: boolean }>) {
  return result?.data ? <Profiles profiles={result.data.agents} /> : null;
}
function ProfileResult({ result }: ToolRenderProps<Profile>) {
  return result?.data ? <Profiles profiles={[result.data]} /> : null;
}
function ProfileUpdate({ args }: ToolRenderProps) {
  const description = inputText(args, "description");
  return description ? <p className="type-body whitespace-pre-wrap break-words">{description}</p> : null;
}
function ListHeader({ invocation }: ToolRenderProps) {
  return <ToolHeader label={useI18n().text(messages.list)} subject={invocation.resource?.title} />;
}

export default {
  resources: [{ kind: Mesh.kind, label: messages.title, icon: <Network className="size-4" />, card: appearance }],
  cards: [cardRenderer(MeshView, { ...appearance, Body: MeshCard })],
  creations: [creationEntry(CreateMesh, {
    id: CreateMesh.id, label: messages.title, icon: <Network className="size-4" />,
    group: "resources", triggers: { menu: { initialInput: {} } },
  })],
  tools: [
    toolRenderer(MeshList, { label: messages.list, icon: <List className="size-3.5" />,
      input: { headerRenderer: ListHeader }, result: { headerRenderer: ListHeader, bodyRenderer: ListResult } }),
    toolRenderer(MeshGetProfile, { label: messages.getProfile, icon: <UserRound className="size-3.5" />, result: { bodyRenderer: ProfileResult } }),
    toolRenderer(MeshSetProfile, { label: messages.setProfile, icon: <UserRoundPen className="size-3.5" />,
      input: { bodyRenderer: ProfileUpdate }, result: { bodyRenderer: ProfileUpdate } }),
    toolRenderer(MeshSend, sendViews), toolRenderer(MeshPeek, peekViews),
  ],
} satisfies RendererModule;
