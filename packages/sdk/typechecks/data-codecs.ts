import { z } from "zod";
import { defineData, present } from "@asterism-app/sdk/contracts";

const Text = defineData("example.codec/text", z.codec(z.string(), z.strictObject({ text: z.string() }), {
  decode: text => ({ text }), encode: value => value.text,
}));
present(Text, { text: "hello" });
// @ts-expect-error Presentations accept the decoded value; the schema owns its wire encoding.
present(Text, "hello");
