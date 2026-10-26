import { z } from "zod";
import { defineCreation, defineImplementation } from "@asterism/sdk/contracts";
import { builtin } from "@asterism/builtin-api/contracts";
import { DirectoryList, DirectoryRead } from "../filesystem/contract.ts";
import { DirectoryFind, DirectoryGrep } from "../filesystem/search-contract.ts";

export const Manual = builtin.resource("manual", z.strictObject({}));
export const CreateManual = defineCreation(Manual, {
  id: builtin.name("manual.create"), schema: z.strictObject({}).describe("No parameters."),
});
export const ManualView = builtin.data("manual.card", z.strictObject({}));

export const ManualList = defineImplementation({
  ...DirectoryList, ...builtin.data("manual.list", DirectoryList.schema), resource: Manual,
});
export const ManualRead = defineImplementation({
  ...DirectoryRead, ...builtin.data("manual.read", DirectoryRead.schema), resource: Manual,
});
export const ManualFind = defineImplementation({
  ...DirectoryFind, ...builtin.data("manual.find", DirectoryFind.schema), resource: Manual,
});
export const ManualGrep = defineImplementation({
  ...DirectoryGrep, ...builtin.data("manual.grep", DirectoryGrep.schema), resource: Manual,
});
