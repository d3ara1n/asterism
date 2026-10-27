import { z } from "zod";
import { builtin } from "@asterism-app/builtin-api/contracts";

const titleResultSchema = z.strictObject({
  title: z.string().describe("The session title."),
}).describe("The session title at the time of this operation.");

export const SessionNameResult = builtin.data("session.name", titleResultSchema);
export const SessionRenameResult = builtin.data("session.rename", titleResultSchema);
