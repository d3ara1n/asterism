# 插件 SDK（`@atelier/sdk`）

`@atelier/sdk` 是宿主与插件共用的独立类型与契约包。宿主实现服务接口，插件贡献模块、资源、工具、视图与生命周期处理器。完整架构与宿主机制见 [插件 SDK 与功能组合](../../docs/plugin-sdk.md)。

SDK 包版本见 [package.json](package.json)，宿主 API 版本见 [`sdkApi`](../../src/plugins/packages.ts)。内置插件领域契约独立在 [`@atelier/builtin-api`](../builtin-api/README.md)，不进入通用 SDK。

## 子路径入口

| 入口 | 内容 |
| --- | --- |
| `@atelier/sdk/contracts` | JSON、数据（`ns.data`）、配置（`ns.config`）、消息（`ns.messages`）、瞬态事件（`ns.event`）、资源／创建／动作／工具／记录契约、工作台快照与公共模型协议、模型表达式／输入媒体 helper、参考价格与计价；不依赖 Node 或 React |
| `@atelier/sdk/runtime` | `definePlugin`、`defineModule`、资源／创建／动作／工具实现 helper、`SessionReader / SessionExecutor`、`ObjectReader / ObjectExecutor` 与宿主服务接口；后台可使用 Node |
| `@atelier/sdk/renderer` | `cardRenderer`、`toolRenderer`、`recordRenderer`、`creationEntry`、对象与全局 hooks（`useRendererObject`、`useRendererConfig`、`useRendererPreferences`、`useRendererEvents`、`useI18n`）；React 由宿主共享 |

`packages/sdk/examples/` 下的可编译作者用例（`author.ts`、`renderer.ts`、`events.ts`、`tool-renderer.ts`、`content-*.ts`、`model-input.ts`、`i18n.ts`）随 `npm run typecheck` 直接验证。

## 最小后台插件示例

```ts
import { z } from "zod";
import { defineRecord, pluginNamespace } from "@atelier/sdk/contracts";
import { defineModule, definePlugin } from "@atelier/sdk/runtime";

const ns = pluginNamespace("example.journal");
const Entry = defineRecord(ns.name("entry"), {
  schema: z.object({ text: z.string() }),
});

export default definePlugin({
  namespace: ns,
  version: "1.0.0",
  modules: [
    defineModule(plugin => ({
      records: [Entry],
      observers: [{
        id: "journal",
        committed(event) {
          const entry = event.snapshot.records.first(Entry, { scope: "timeline" });
          if (entry?.status === "known") plugin.log.info(entry.data.text);
        },
      }],
    })),
  ],
});
```

## 核心作者接口速查

### 1. 会话、对象、创建与动作
- **读取与提交**：`plugin.session(id)` 与 `plugin.object(ref)` 提供 `snapshot()`、`get(DataContract)` 与同步 `commit(writer => { writer.set(...); writer.append(...); })`。快照按需读取 `records.all / query / first / last`（支持 `scope: "timeline" | "session"`）。
- **具型创建与动作**：在 `contracts` 中用 `defineCreation(resource, { id, schema })` 与 `defineAction(resource, { id, schema })` 声明；在 `runtime` 中用 `implementResource` 聚合 `creation`、`actions`、`project`、`inspect`、`context`；在 `renderer` 中用 `session.create(CreationContract, input, position)` 与 `object.invoke(ActionContract, input)` 调用。
- **不可变内容（`ContentRef`）**：在 schema 中组合 `contentRefSchema`；在 `prepare / create / execute` 或前端 `InputView / object.input` 中通过 `content` 门面调用 `read / open / stage`（作用域规则见 [不可变内容](../../docs/content.md)）。

### 2. 公共模块导出（`./public`）
插件可通过 `package.json` 的 `exports["./public"]` 向其他插件导出共享契约、服务或状态（宿主保证同一运行环境内提供方与消费者取得同一模块实例）：

```json
{
  "name": "@example/tools",
  "exports": { "./public": "./src/public.ts" },
  "atelier": {
    "id": "example.tools",
      "api": { "major": 8, "minMinor": 2 },
    "runtime": "./src/runtime.ts"
  }
}
```

### 3. 全局具型事件、配置与国际化
- **瞬态事件**：`ns.event(name, { schema, source, semantics })` 声明 `occurrence` 或 `snapshot` 事件；后台用 `plugin.ipc.events.publish / subscribe` 或 `object.events.publish`，前端用 `prepare({ events })` 或 `useRendererEvents()`。资源可直接发布宿主公共 `ResourceStatusChanged`。
- **具型调用（API 8.5）**：`defineCall(id, { input, output })` 声明，`implementCall(contract, handler)` 经 `ModuleContribution.calls` 登记。后台 `plugin.ipc.calls.invoke`、前端 `useRendererCalls().invoke` 均传入契约、输入和 `{ object: ResourceRef, signal? }`；处理器收到只读关联对象、来源和取消信号。规则见 [插件调用](../../docs/plugin-sdk.md#具型插件调用)，可编译示例见 `examples/plugin-calls.ts`。
- **插件配置**：`ns.config(schema, defaults, { presentation? })` 声明唯一配置；后台 `plugin.config(contract)`，前端 `useRendererConfig(contract)`。
- **界面本地化（`UiText`）**：普通字符串直接可用；需多语言时用 `ns.messages("en", defineMessages({ ... }))` 声明，在 `atelier.i18n.catalogs` 登记译文 JSON，前端通过 `useI18n()` 格式化（详见 [公共 i18n](../../docs/i18n.md)）。

### 4. 前端卡片与工具三态视图
- **卡片视图**：`cardRenderer(ViewContract, { width, height, minWidth?, minHeight?, Body, Actions?, panels? })`，内部通过 `useRendererObject()` 访问对象数据、动作调用与二进制流 `onStream`。
- **对象保留状态（API 8.7）**：`object.retained.get("<plugin>/<key>", create, release?)` 保存草稿等需要跨重挂载与会话切换保持的前端状态，对象离开投影时宿主调用 `release`；`discard(key)` 提前结束。规则见 [前端视图与扩展入口](../../docs/plugin-sdk.md#前端视图与扩展入口)，可编译示例见 `examples/renderer.ts`。
- **滚动与缩放**：卡片内交互遵循 [画布与对象卡片](../../docs/workbench.md#画布与对象卡片) 的手势归属规则。
- **辅助面板（API 8.2）**：`panels: [{ id: "details", label: "Details", icon, Body: Details }]`；主体与面板通过 `useRendererCard().openPanel("details") / closePanel()` 控制卡片局部视图。面板注册、数据绑定与生命周期见 [前端视图与扩展入口](../../docs/plugin-sdk.md#前端视图与扩展入口)，可编译示例见 `examples/renderer.ts`。
- **工具视图**：`toolRenderer(ToolContract, { label?, icon?, input?, execution?, result? })`，三阶段平行可选，每阶段提供 `{ headerRenderer?, bodyRenderer? }`，可用 `ToolRenderProps<D, T, A>` 跨阶段复用组件。
- **顶层工具（API 8.5）**：`defineTopLevelTool` 一次提供定义、参数／结果 schema 和 `execute`，经 `ModuleContribution.topLevelTools` 注册；每次调用取得只读 `object`、`callId`、`signal`、`publish`。展示可共享具有相同稳定 ID 的数据契约。详见 [工具贡献](../../docs/plugin-sdk.md#工具贡献)。
- **替换已有工具**：顶层工具替换、资源实现替换与全局 schema 替换的注册规则，以及稳定 ID、装配顺序和历史展示的边界，见 [工具覆盖](../../docs/runtime.md#工具覆盖)。

### 5. 可选模型分支（`plugin.models`）
不依赖内置 Agent 的无状态模型服务（详细协议与续接规则见 [运行时](../../docs/runtime.md#用户输入文件与模型协议适配)）：
- `models.roles()` / `models.list()`：读取模型角色与可用模型目录。
- `resolveModelSelection(defaults, overrides)`（`contracts`）：展示与请求共用的模型／思考等级覆盖计算，空值沿用默认值；可用性与凭据由消费边界校验。
- `models.validate(request, { content? })`：校验模型目标、续接资料与文件引用资格，不发送网络请求。
- `models.stream(request, { content? })`：执行单次无工具补全（支持可选 `maxOutputTokens`、`userAgent`、`sessionId`），流式交付协议事件。`finish.timing`（API 8.6）可携带请求计时，与 usage 一起按 `ModelCompletion` 保存。
- `models.run(request)`：绑定具体资源对象（`object`）与请求起点（`requestParentId`），执行一次模型请求及该响应的完整资源工具批次，经 `ModelRunObserver.event` 同步交付 `block`（最高序号块内含 `completion` 终态）、`diagnostic` 与 `progress`。终态包含 `usage` 及可选 `timing`（API 8.6）。结果附带 `diagnostics`（API 8.3）：系统提示块的种类、来源与字数及声明的工具名称，不含正文；失败或取消未取得可交付终态时，`diagnostics.timing` 保留已测量计时。可用 `requestDiagnosticsSchema` 校验保存（分区语义见 [请求诊断](../../docs/runtime.md#请求诊断)）。外层多轮循环与时间线提交由调用方插件自行驱动。
