export type AgentPromptBlock = (
  | { id: string; kind: "system"; from: string; text: string }
  | { id: string; kind: "agent"; role: string; text: string }
  | { id: string; kind: "context"; file: string; text: string }
) & { source: { id: string; plugin: string | null } };
