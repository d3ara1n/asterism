import { describe, expect, it } from "vitest";
import { configurationField, objectValue } from "./configuration-fields.ts";
import { hostCatalog } from "./host-catalog.ts";
import { MessageFormatter } from "./i18n.ts";
import { modelCompatibilityDefinition, modelCompatibilityForm } from "./model-compatibility.ts";

function thinkingLevelForm(locale: string) {
  const definition = modelCompatibilityDefinition("customThinkingLevels");
  if (definition?.kind !== "options") throw new Error("Expected thinking-level options.");
  const formatter = new MessageFormatter(locale, [hostCatalog]);
  return configurationField(modelCompatibilityForm(definition, value => formatter.text(value)));
}

describe("Compatibility form localization", () => {
  it("localizes nested thinking fields without losing the nullable control or sharing a previous locale's labels", () => {
    const english = thinkingLevelForm("en");
    const chinese = thinkingLevelForm("zh-Hans");
    if (english.kind !== "object" || chinese.kind !== "object") throw new Error("Expected a thinking-level object form.");
    const field = chinese.properties.low!;
    expect(objectValue(field)?.title).toMatch(/\p{Script=Han}/u);
    expect(objectValue(field)?.description).toMatch(/\p{Script=Han}/u);
    expect(objectValue(english.properties.low)?.title).not.toMatch(/\p{Script=Han}/u);
    expect(configurationField(field).kind).toBe("nullable-string");
  });
});
