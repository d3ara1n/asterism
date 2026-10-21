import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { pluginNamespace } from "@atelier/sdk/contracts";
import { I18nProvider, RendererCallsProvider, type ToolRenderProps } from "@atelier/sdk/renderer";
import { MessageFormatter } from "../../shared/i18n";
import translations from "../../../packages/builtin/src/locales/zh-Hans.json";
import renderer from "../../../packages/builtin/src/resources/renderer";
import { ResourceCreateResult, CreationInspectResult } from "../../../packages/builtin/src/resources/contract";
import { CreationDirectoryProvider } from "../../../packages/builtin/src/resources/directory";
import { ViewRegistry } from "./registry";
import { ModuleViewsProvider } from "./views";

const ns = pluginNamespace("example.documents");
const resource = { kind: ns.name("document"), icon: null,
  label: ns.messages("en", { name: { id: "kind", defaultMessage: "Document" } }).name };
const registry = new ViewRegistry([renderer, { resources: [resource], cards: [], tools: [] }]);
const calls = { async invoke(): Promise<never> { throw new Error("Static rendering must not invoke the backend."); } };
function header(props: ToolRenderProps, locale = "en", contract = ResourceCreateResult.id) {
  const formatter = Object.assign(new MessageFormatter(locale, [
    { owner: ns.id, locale: "zh-Hans", revision: "test", messages: { kind: "文档" } },
    { owner: "atelier.builtin", locale: "zh-Hans", revision: "test", messages: translations },
  ]), { interfaceLocale: locale, revision: 1 });
  const view = registry.tool({ id: contract }, props)!;
  const content = createElement(RendererCallsProvider, { value: calls },
    createElement(CreationDirectoryProvider, { children: view.header }));
  return renderToStaticMarkup(createElement(I18nProvider, {
    value: formatter, children: createElement(ModuleViewsProvider, { registry, children: content }),
  }));
}
const base = { name: "resource_create", target: null, invocation: {},
  args: { creation_id: "example.factory/from-template", input: { title: "Predicted title" } } };

describe("创建工具的资源摘要", () => {
  // 依据工作台三态契约：入口输入不是实例标题，标题只在成功创建后从结果显示。
  it("填充、准备、执行及失败都不预览输入标题，成功采用实际标题", () => {
    const pending: ToolRenderProps[] = [
      { ...base, phase: "input", result: null },
      { ...base, phase: "ready", result: null },
      { ...base, phase: "executing", result: { kind: "running", data: { type: resource.kind } } },
      { ...base, phase: "settled", result: { kind: "rejected", data: { type: resource.kind }, error: { code: "invalid_argument", message: "Rejected." } } },
    ];
    for (const props of pending) {
      const markup = header(props);
      expect(markup).not.toContain("Predicted title");
      expect(markup).not.toContain(base.args.creation_id);
    }
    const props: ToolRenderProps = { ...base, phase: "settled", result: { kind: "succeeded",
      data: { resource_id: "created", type: resource.kind, title: "调研记录" } } };
    const english = header(props), chinese = header(props, "zh-Hans");
    expect(english).toContain("Create resource");
    expect(english).toContain("Document");
    expect(chinese).toContain("创建资源");
    expect(chinese).toContain("文档");
    for (const markup of [english, chinese]) {
      expect(markup).toContain("调研记录");
      expect(markup).not.toContain("Predicted title");
    }
    // 已保存结果缺标题时仍能显示类型，不从入口输入或当前对象补造历史标题。
    const withoutTitle = header({ ...base, phase: "settled", result: { kind: "succeeded",
      data: { resource_id: "created", type: resource.kind } } });
    expect(withoutTitle).toContain("Document");
    expect(withoutTitle).not.toContain("Predicted title");
  });

  // 依据历史展示契约：查询结果已保存类型，即使当前入口目录未加载也能使用资源提供方的本地化名称。
  it("查看入口按结果类型显示名称，不要求入口与资源类型同名", () => {
    const markup = header({ ...base, name: "creation_inspect", phase: "settled", result: { kind: "succeeded",
      data: { id: base.args.creation_id, resourceKind: resource.kind, description: "Create a document.", guidelines: [], input: {} } } },
    "zh-Hans", CreationInspectResult.id);
    expect(markup).toContain("文档");
    expect(markup).not.toContain(base.args.creation_id);
  });
});
