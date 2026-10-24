import { defineModule, defineTopLevelTool, implementCall } from "@atelier/sdk/runtime";
import { z } from "zod";
import { TextError, readToModel } from "../shared/text.ts";
import { filesystemFailure } from "../filesystem/errors.ts";
import { SkillError, type SkillCatalog } from "./catalog.ts";
import { ReadSkills, RefreshSkills, SkillsChanged, SkillRead, SkillRefresh, skillReadArgsSchema } from "./contract.ts";

export function createSkillsModule(catalog: SkillCatalog) {
  return defineModule(plugin => {
    const refresh = (signal: AbortSignal) => {
      const data = catalog.refresh(signal);
      plugin.ipc.events.publish(SkillsChanged, data);
      return data;
    };
    return {
      events: [SkillsChanged],
      calls: [
        implementCall(ReadSkills, async () => catalog.overview()),
        implementCall(RefreshSkills, async (_input, { signal }) => refresh(signal)),
      ],
      topLevelTools: [defineTopLevelTool({
        id: SkillRead.id,
        name: "skill_read",
        description: "Read a skill's instructions or a supporting UTF-8 file within its package.",
        guidelines: [
          "The system prompt contains the skill catalog with names, descriptions and SKILL.md locations.",
          "path is relative to the selected skill's directory. Package file reads stay within that directory, including symbolic link resolution.",
          "offset and limit select complete lines. nextOffset identifies where remaining content starts.",
        ],
        argsSchema: skillReadArgsSchema, resultSchema: SkillRead.schema,
        effect: "read", execution: "parallel",
        async execute(args, { signal }) {
          try { return { kind: "succeeded", data: await catalog.read(args, signal) }; }
          catch (error) {
            if (signal.aborted) return { kind: "cancelled", message: "Skill reading was cancelled." };
            if (error instanceof SkillError) return { kind: "rejected", error: { code: error.code, message: error.message } };
            if (error instanceof TextError) return error.outcome();
            return filesystemFailure(error, "Read skill file");
          }
        },
        toModel: data => `Skill: ${data.name}\nDirectory: ${data.directory}\nFile: ${data.path}\n${readToModel(data, "offset")}`,
      }), defineTopLevelTool({
        id: SkillRefresh.id, name: "skill_refresh",
        description: "Refresh the shared skill catalog from installed skills after adding, editing or removing a skill.",
        guidelines: ["The updated catalog is shared by all Agents and settings. Subsequent model requests receive its names and descriptions."],
        argsSchema: z.strictObject({}).describe("Empty parameter object."),
        resultSchema: SkillRefresh.schema, effect: "write", execution: "sequential",
        async execute(_args, { signal }) {
          signal.throwIfAborted();
          return { kind: "succeeded", data: refresh(signal) };
        },
      })],
    };
  });
}
