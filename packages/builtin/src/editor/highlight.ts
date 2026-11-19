import { resolveCodeViewThemes } from "@asterism-app/ui/code-theme";
import { HighlightStyle, type TagStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";

let loadingStyle: Promise<HighlightStyle> | undefined;

export function loadEditorHighlightStyle(): Promise<HighlightStyle> {
  return loadingStyle ??= createEditorHighlightStyle().catch(error => { loadingStyle = undefined; throw error; });
}

/** Translate Lezer tags to representative TextMate scopes without duplicating Pierre's colors. */
async function createEditorHighlightStyle(): Promise<HighlightStyle> {
  const [light, dark] = await resolveCodeViewThemes();
  if (!light?.textmate || !dark?.textmate) throw new Error("Code view themes must include TextMate syntax palettes.");
  const colors = [light.textmate, dark.textmate].map(theme => {
    const byScope = new Map<string, string>();
    for (const { scope, settings: { foreground } } of theme.settings) {
      if (!scope || !foreground) continue;
      // Later rules override earlier foregrounds for the same scope.
      for (const name of typeof scope === "string" ? [scope] : scope) byScope.set(name, foreground);
    }
    return byScope;
  });
  const token = (tag: TagStyle["tag"], scope: string, style: Partial<TagStyle> = {}): TagStyle => {
    const [light, dark] = colors.map(palette => palette.get(scope));
    // Resolve against the host color scheme in CSS, without reconfiguring the editor on a mode change.
    return { tag, ...style, ...(light && dark ? { color: `light-dark(${light}, ${dark})` } : {}) };
  };
  return HighlightStyle.define([
    token([tags.comment, tags.meta], "comment"),
    token(tags.operator, "keyword.operator"),
    token(tags.keyword, "keyword"),
    token(tags.modifier, "storage.modifier"),
    token(tags.string, "string"),
    token(tags.regexp, "string.regexp"),
    token(tags.escape, "constant.character.escape"),
    token(tags.number, "constant.numeric"),
    token([tags.bool, tags.null, tags.atom], "constant.language"),
    token(tags.self, "variable.language"),
    token(tags.variableName, "variable"),
    token(tags.typeName, "entity.name.type"),
    token(tags.className, "entity.name.class"),
    token(tags.namespace, "entity.name.namespace"),
    token(tags.propertyName, "support.type.property-name.json"),
    token(tags.tagName, "entity.name.tag"),
    token(tags.attributeName, "entity.other.attribute-name"),
    token([tags.function(tags.variableName), tags.function(tags.propertyName), tags.macroName], "entity.name.function"),
    token(tags.annotation, "meta.decorator"),
    token(tags.heading, "markup.heading", { fontWeight: "bold" }),
    token(tags.strong, "markup.bold", { fontWeight: "bold" }),
    token(tags.emphasis, "markup.italic", { fontStyle: "italic" }),
    token([tags.link, tags.url], "markup.underline.link.markdown", { textDecoration: "underline" }),
    token(tags.monospace, "markup.inline.raw.markdown"),
    token(tags.quote, "markup.quote.markdown"),
    token(tags.invalid, "invalid.illegal"),
  ]);
}
