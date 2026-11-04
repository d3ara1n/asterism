import { format } from "prettier/standalone";
import * as babel from "prettier/plugins/babel";
import * as estree from "prettier/plugins/estree";

/** Presentation only; invalid scripts retain the source that was submitted. */
export async function formatScriptCode(code: string): Promise<string> {
  try {
    return await format(code, { parser: "babel", plugins: [babel, estree] });
  } catch {
    return code;
  }
}
