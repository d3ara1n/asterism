import * as runtime from "@asterism/builtin-api/runtime";
import { builtinPublicModules } from "./builtin-public.ts";

/** Bind backend public instances separately so frontend composition does not import backend domain services. */
export const builtinRuntimePublicModules = { ...builtinPublicModules, "@asterism/builtin-api/runtime": runtime };
