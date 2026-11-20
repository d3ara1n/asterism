import type { DropItem, I18n } from "@asterism-app/sdk/renderer";
import { expect, it } from "vitest";
import { describeDropTypes } from "./drop-feedback";

const english: Pick<I18n, "locale" | "formatMessage"> = { locale: "en", formatMessage: message => message.defaultMessage };

it("distinguishes a text file from dragged text even though both have the same MIME type", () => {
  const file = new File([], "notes.txt", { type: "text/plain" });
  const item: DropItem = { kind: "file", file, name: file.name, mime: file.type, directory: false };
  expect(describeDropTypes(english, [item, { kind: "text", text: "notes" }, item], ["Files", "text/html"]))
    .toBe("File · text/plain, Text · text/plain");
});

it("reports the offered type when the payload has no routable representation", () => {
  expect(describeDropTypes(english, [], ["text/html", "text/html"])).toBe("text/html");
});
