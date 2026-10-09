import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineImplementation, defineResource, defineTool } from "../shared/module-contract.ts";
import { defineData } from "../shared/presentation.ts";
import { Read } from "./declarations.ts";
import { implement } from "./contract.ts";
import { ToolRegistry } from "./registry.ts";
import { NoteRead } from "../modules/notes/contract.ts";
import { DirectoryRead } from "../modules/filesystem/contract.ts";

describe("工具实现注册边界", () => {
  const note = implement(NoteRead, { async call() { return { kind: "succeeded", data: { text: "note" } }; } });
  const file = implement(DirectoryRead, { async call() { return { kind: "succeeded", data: { path: "a", text: "file" } }; } });

  it("同一工具共享 args，target 与 result 分别由实现定义", () => {
    expect(NoteRead.tool).toBe(Read);
    expect(DirectoryRead.tool).toBe(Read);
    expect(() => new ToolRegistry([note, file])).not.toThrow();
    expect(NoteRead.targetSchema.safeParse({ path: "a" }).success).toBe(false);
    expect(DirectoryRead.targetSchema.safeParse(null).success).toBe(false);
  });

  it("拒绝冲突的工具 args、重复支持关系和重复实现身份", () => {
    expect(() => new ToolRegistry([note, note])).toThrow("Duplicate tool implementation");
    expect(() => new ToolRegistry([note, { ...file, reference: note.reference }])).toThrow("Duplicate tool implementation");
    expect(() => new ToolRegistry([note, { ...file, resourceKind: "note" }])).toThrow("Duplicate tool implementation");
    expect(() => new ToolRegistry([note, { ...file, tool: defineTool("read", z.strictObject({ path: z.string() })) }]))
      .toThrow("Conflicting tool contract");
  });

  it("target 可以是方块定位，handler 与模型投影按各自契约执行", async () => {
    const contract = defineImplementation({
      ...defineData("test.game.move", 1, z.strictObject({ x: z.number().nonnegative(), piece: z.string() })),
      resource: defineResource("game", z.object({ origin: z.number() })),
      tool: defineTool("move", z.strictObject({ delta: z.number() })),
      targetSchema: z.strictObject({ piece: z.string() }),
      description: "Move a piece.", effect: "write", execution: "sequential",
    });
    const implementation = implement(contract, {
      async call(state, target, args) {
        return { kind: "succeeded", data: { x: state.origin + args.delta, piece: target.piece } };
      },
      toModel: result => `Moved ${result.piece} to ${result.x}`,
    });
    const resource = { id: "game", kind: "game", title: "Game", data: { origin: 2 } };
    const invoke = (delta: number) => {
      const prepared = implementation.prepare(resource, { piece: "T" }, { delta });
      if (!("execute" in prepared)) throw new Error("Valid arguments were rejected.");
      return prepared.execute(new AbortController().signal);
    };
    expect(await invoke(1)).toEqual({ kind: "succeeded", data: { x: 3, piece: "T" },
      model: "Moved T to 3", implementation: { id: "test.game.move", version: 1 } });
    expect(implementation.prepare(resource, { path: "T" }, { delta: 1 })).toMatchObject({ kind: "rejected" });
    expect(implementation.prepare(resource, { piece: "T" }, { delta: "1" })).toMatchObject({ kind: "rejected" });
    expect(implementation.prepare({ ...resource, data: {} }, { piece: "T" }, { delta: 1 })).toMatchObject({ kind: "failed" });
    // TS 的 number 无法表达非负范围，返回值仍必须通过运行时契约。
    await expect(invoke(-3)).rejects.toThrow();
  });
});
