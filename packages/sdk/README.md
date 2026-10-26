# 插件 SDK（`@asterism/sdk`）

`@asterism/sdk` 是宿主与插件共用的独立类型与契约包。宿主实现服务接口，插件贡献模块、资源、工具、视图与生命周期处理器。完整架构与宿主机制见 [插件 SDK 与功能组合](../../docs/plugin-sdk.md)。

SDK 包版本见 [package.json](package.json)，宿主 API 版本见 [`sdkApi`](../../src/plugins/packages.ts)。内置插件领域契约独立在 [`@asterism/builtin-api`](../builtin-api/README.md)，不进入通用 SDK。

当前宿主 API 为 **19.0**，插件声明 `{ "major": 19, "minMinor": 0 }`，依赖 `@asterism/sdk: ^0.45.0`。后台通过 `session.invoke` 调用资源动作；清理登记到 `plugin.lifetime` 与资源 `attach` 的对象生命周期；前端入口默认导出 `defineRendererPlugin(...)`，`prepare` 上下文提供 `events / calls / signal`，调用契约显式声明 `scope`。

## 子路径入口

| 入口 | 内容 |
| --- | --- |
| `@asterism/sdk/contracts` | JSON、数据（`ns.data`）、配置（`ns.config`）、消息（`ns.messages`）、瞬态事件（`ns.event`）、资源／创建／动作／工具／记录契约、工作台快照与公共模型协议、模型表达式／输入媒体 helper、参考价格与计价；不依赖 Node 或 React |
| `@asterism/sdk/runtime` | `definePlugin`、`defineModule`、资源／创建／动作／工具实现 helper、`SessionReader / SessionExecutor`、`ObjectReader / ObjectExecutor` 与宿主服务接口；后台可使用 Node |
| `@asterism/sdk/renderer` | `defineRendererPlugin`、设置页面、功能视图（`cardRenderer`、`toolRenderer`、`recordRenderer`、`creationEntry`）、对象与全局 hooks；React 由宿主共享 |

`packages/sdk/examples/` 下的可编译作者用例（`author.ts`、`renderer.ts`、`events.ts`、`tool-renderer.ts`、`content-*.ts`、`model-input.ts`、`i18n.ts`）随 `npm run typecheck` 直接验证。

## 最小后台插件示例

```ts
import { z } from "zod";
import { defineRecord, pluginNamespace } from "@asterism/sdk/contracts";
import { defineModule, definePlugin } from "@asterism/sdk/runtime";

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
- **读取与提交**：`plugin.session(id)` 与 `plugin.object(sessionId, ResourceContract, id)` 提供 `snapshot()`、`get(DataContract)` 与同步 `commit(writer => { writer.set(...); writer.append(...); })`。快照按需读取 `records.all / query / first / last`（支持 `scope: "timeline" | "session"`）。
- **时间线占用与内存投影**：`object.withBusy(async signal => { ... }, { signal? })` 保护依赖当前路径的异步工作；`object.invalidate()` 交付该资源当前投影。两者分别用于宿主时间线保护和资源自己的领域视图，完整语义见 [宿主运行生命周期](../../docs/plugin-sdk.md#宿主运行生命周期)。
- **生命周期与释放提示（API 17.0）**：`plugin.lifetime` 承载插件共享服务的清理；`implementResource({ attach(data, object, lifetime) })` 在对象进入当前集合时调用，对象独占的外部实例向 `lifetime.defer` 登记清理，对象移除、会话归档与退出共用同一路径。`implementResource` 的可选 `disposalWarning` 提供用户结束实例的确认说明，规则见 [生命周期作用域](../../docs/plugin-sdk.md#生命周期作用域)。
- **会话目录与资源管理（API 9.1，初始资源链接为 10.1，创建标题为 10.2）**：`plugin.sessions.list()` 读取活跃会话摘要，`archived()` 读取回收站会话（API 17.0），两者都不含的会话已删除；`session.create(CreationContract, input, { signal?, content?, linkTo?, resources? })` 返回 `ResourceCreationResult`（兼容 `ResourceRef`，附带提交时的 `title`），`resources` 是新资源接收的引用列表。工具的 `context.session.create(contract, input, { resources?, exposeSelf? })` 返回同一结果，接收本请求有效范围内的资源 ID 列表；API 11.2 的 `exposeSelf` 选项由宿主绑定发起者身份，语义见会话资源接口。`session.link(receiver, resource)`、`unlink(receiver, resource)`、`remove(resource)` 使用完整引用，作用域、原子性与收束规则见 [会话资源接口](../../docs/plugin-sdk.md#会话目录与资源操作api-91)，可编译示例见 `examples/session-resources.ts`。
- **具型创建与动作**：在 `contracts` 中用 `defineCreation(resource, { id, schema })` 与 `defineAction(resource, { id, schema })` 声明；在 `runtime` 中用 `implementResource` 聚合 `creation`、`actions`、`project`、`inspect`、`context`；在 `renderer` 中用 `session.create(CreationContract, input, position)` 与 `object.invoke(ActionContract, input)` 调用。
- **后台资源动作（API 11.1）**：`plugin.session(sessionId).invoke(ActionContract, target, input, { signal?, content? })` 返回 `Promise<void>`，复用完整准备和对象队列。调用其他插件资源不取得其私有对象门面；返回表示动作处理完成，独立托管工作由资源继续管理。取消、附件交接和重入规则见 [后台资源动作](../../docs/plugin-sdk.md#后台资源动作api-111)，可编译示例见 [`examples/session-resources.ts`](examples/session-resources.ts)。
- **不可变内容（`ContentRef`）**：在 schema 中组合 `contentRefSchema`；在 `prepare / create / execute` 或前端 `InputView / object.input` 中通过 `content` 门面调用 `read / open / stage`（作用域规则见 [不可变内容](../../docs/content.md)）。

### 2. 公共模块导出（`./public`）
插件可通过 `package.json` 的 `exports["./public"]` 向其他插件导出共享契约、服务或状态（宿主保证同一运行环境内提供方与消费者取得同一模块实例）：

```json
{
  "name": "@example/tools",
  "exports": { "./public": "./src/public.ts" },
  "asterism": {
    "id": "example.tools",
    "api": { "major": 19, "minMinor": 0 },
    "runtime": "./src/runtime.ts"
  }
}
```

### 3. 全局具型事件、配置与国际化
- **瞬态事件**：`ns.event(name, { schema, source, semantics })` 声明 `occurrence` 或 `snapshot` 事件；后台用 `plugin.ipc.events.publish / subscribe` 或 `object.events.publish`，前端用 `prepare({ events })` 或 `useRendererEvents()`。资源可直接发布宿主公共 `ResourceStatusChanged`。
- **具型调用**：`defineCall(id, { scope: "plugin" | "object", input, output })` 声明，`implementCall(contract, handler)` 经插件 `setup` 或模块返回的 `calls` 登记。后台 `plugin.ipc.calls.invoke`、前端 `useRendererCalls().invoke` 均传入契约、输入和选项：插件级使用 `{ signal? }`，对象级使用 `{ object: ResourceRef, signal? }`。只有对象级处理器具有只读关联对象。规则见 [插件调用](../../docs/plugin-sdk.md#具型插件调用)，可编译示例见 `examples/plugin-calls.ts` 与 `examples/settings-runtime.ts`。
- **插件配置**：`ns.config(schema, defaults)` 声明可选托管配置，后台 `plugin.config(contract)` 提供 `get / update / subscribe`。`useRendererConfig(contract)` 读取值；设置页面使用 `useRendererConfiguration(contract)` 取得 `value / status / ready / error / save / reset / refresh`。保存与恢复默认返回 Promise，写入在后台校验，并更新前后台订阅；界面读取未就绪时不应以默认值提交。配置契约不包含布局或标签，插件自行组织页面。
- **界面本地化（`UiText`）**：普通字符串直接可用；需多语言时用 `ns.messages("en", defineMessages({ ... }))` 声明，在 `asterism.i18n.catalogs` 登记译文 JSON，前端通过 `useI18n()` 格式化（详见 [公共 i18n](../../docs/i18n.md)）。

### 4. 插件装配与设置页面

存储准备（API 18.2）：清单 `asterism.storage` 指向默认导出 `defineStorage([...])` 的轻量入口，按格式版本号为 JSON 与 SQLite 声明连续迁移；宿主在插件运行时之前导入并执行，失败只停用该插件。见[插件存储准备](../../docs/plugin-sdk.md#插件存储准备api-182)及可编译示例 [`storage.ts`](examples/storage.ts)。

后台 `definePlugin({ namespace, version, setup?, modules? })` 的同步 `setup(plugin)` 创建插件级共享服务，返回 `PluginContribution`：与模块共用具型贡献字段，并可返回 `modules`；清理登记到 `plugin.lifetime.defer`。根入口返回的模块先装配，再装配静态 `modules`；关闭先收束工作与全部对象生命周期，再逆序执行登记的清理，模块先于根服务释放。服务通过普通函数参数或闭包传给模块，不需要服务注册表。

前端 `defineRendererPlugin({ modules?, settings?, prepare?, closing? })` 是插件入口。`settings: { Body, locations? }` 与模块平级；页面组件接收可选 `location`，无会话或对象上下文，能使用全局调用、事件、i18n、本插件偏好和托管配置。插件 `prepare({ events, signal })` 先于自己的模块准备；失败阻止该插件及依赖方装配，关闭在取消后等待实际准备结束再调用 `closing`。页面卸载取消页面发起的通信调用，不销毁后台服务。

`useRendererSettings().open(pluginId, location?)` 打开已登记设置页；非根位置须列入 `settings.locations`，未知插件或位置明确报错。完整可编译示例按进程拆分为 `examples/settings-contract.ts`、`examples/settings-runtime.ts`、`examples/settings-renderer.ts`。

设置页内可用浮岛接口（API 15.1）：`useRendererIsland()` 返回 `{ child, open, close, closeChild, guard }`，`open({ key, label, origin?, render })` 在所在浮岛右侧打开更深浮岛，`child` 为当前打开的子浮岛 `key`，可用于行选中。浮岛内容使用宿主注入的 `IslandPanel({ title, description?, action?, toolbar?, dirty?, children })`；`dirty` 为 true 时宿主在关闭前确认放弃修改，`useRendererCloseGuard(guard)` 注册自定义守卫。`render` 在宿主每次渲染时调用，内容应按身份读取最新数据而非依赖打开时的快照。语义见 [插件浮岛](../../docs/plugin-sdk.md#插件配置与界面本地化)。

信息卡片从包读取元信息：标准 `name / description / version / author`，可用 `asterism.displayName / description`（接受 `UiText`）覆盖显示文案；`asterism.icon` 是包内 PNG、JPEG、WebP 或 SVG 图片的相对路径。宿主读取静态信息不执行插件代码，配置页面由 renderer 单独提供。

### 5. 前端卡片与工具三态视图
- **卡片几何（API 18.1）**：从 `contracts` 导入 `CardAppearance`，在共享文件声明默认尺寸和下限，交给后台 `implementResource` 的 `card`、前端资源描述的 `card` 与 `cardRenderer`。声明和放置契约见 [卡片几何声明](../../docs/plugin-sdk.md#前端视图与扩展入口)，完整例子见 `examples/counter-contract.ts`、`examples/author.ts` 与 `examples/renderer.ts`。
- **资源展示目录（API 10.2）**：`useRendererResources().list()` 枚举已登记的 `ResourceDescription`，`get(kind)` 查询单一类型（缺失时返回宿主通用描述）。组件用 `useI18n().text(description.label)` 取得当前语言名称，`description.icon` 可直接渲染；不需要资源实例或卡片投影。
- **卡片视图**：`cardRenderer(ViewContract, { width, height, minWidth?, minHeight?, Body, Actions?, panels? })`，内部通过 `useRendererObject()` 访问对象数据、动作调用与对象级双工通道 `openChannel(contract)`（API 15.0，后台以 `implementChannel` 登记，见 [对象级双工通道](../../docs/plugin-sdk.md#对象级双工通道api-150)）。
- **局部操作（API 13.0）**：`object.view.ready` 表示视图可操作；按钮自行管理 `await object.invoke(...)` 期间的 pending。动作完成直接返回，数据变化通过宿主通道交付，调用不隐含会话读取。资源业务状态通过自己的展示契约交付，宿主 busy 不作为卡片的运行或加载状态。
- **对象保留状态（API 8.7）**：`object.retained.get("<plugin>/<key>", create, release?)` 保存草稿等需要跨重挂载与会话切换保持的前端状态，对象离开投影时宿主调用 `release`；`discard(key)` 提前结束。规则见 [前端视图与扩展入口](../../docs/plugin-sdk.md#前端视图与扩展入口)，可编译示例见 `examples/renderer.ts`。
- **滚动与缩放**：卡片内交互遵循 [画布与对象卡片](../../docs/workbench.md#画布与对象卡片) 的手势归属规则。
- **辅助面板（API 8.2）**：`panels: [{ id: "details", label: "Details", icon, Body: Details }]`；主体与面板通过 `useRendererCard().openPanel("details") / closePanel()` 控制卡片局部视图。面板注册、数据绑定与生命周期见 [前端视图与扩展入口](../../docs/plugin-sdk.md#前端视图与扩展入口)，可编译示例见 `examples/renderer.ts`。
- **工具视图**：`toolRenderer(ToolContract, { label?, icon?, input?, execution?, result? })`，三阶段平行可选，每阶段提供 `{ headerRenderer?, bodyRenderer? }`，可用 `ToolRenderProps<D, T, A>` 跨阶段复用组件。
- **流式预览声明**（API 15.3）：输入和执行视图可在 `bodyRenderer` 旁声明 `streaming(props)`，提供正文可预览的判断；工具外壳按用户偏好处理开合，正文布局与滚动仍由插件实现。返回值与生命周期语义见 [工具流式预览声明](../../docs/plugin-sdk.md#前端视图与扩展入口)，输入与输出示例见 [`examples/tool-renderer.ts`](examples/tool-renderer.ts)。
- **条目视图状态**（API 15.2）：对话时间线是虚拟列表，工具视图会随滚动重新挂载；需要保留的展开、选项等状态用 `useRendererViewState(key, initial)` 存取，key 以插件 ID 为前缀。语义见 [虚拟化与条目视图状态](../../docs/plugin-sdk.md#前端视图与扩展入口)。
- **顶层工具**：`defineTopLevelTool` 一次提供定义、参数／结果 schema 和 `execute`，经 `ModuleContribution.topLevelTools` 注册；每次调用取得只读 `object`、受本次执行约束的 `session`（API 9.1）、`callId`、`signal`、`publish`。展示可共享具有相同稳定 ID 的数据契约。详见 [工具贡献](../../docs/plugin-sdk.md#工具贡献)。
- **资源工具调用者（API 11.3）**：`implementTool` 的 `call` 上下文包含 `caller: ToolCaller`，其 `ref / title` 由宿主在请求边界捕获；`object` 仍为工具目标。身份与权限边界见 [工具贡献](../../docs/plugin-sdk.md#工具贡献)。
- **替换已有工具**：顶层工具替换、资源实现替换与全局 schema 替换的注册规则，以及稳定 ID、装配顺序和历史展示的边界，见 [工具覆盖](../../docs/runtime.md#工具覆盖)。

### 6. 可选模型分支（`plugin.models`）
不依赖内置 Agent 的无状态模型服务（详细协议与续接规则见 [运行时](../../docs/runtime.md#用户输入文件与模型协议适配)）：
- `models.roles()` / `models.list()`：读取模型角色与可用模型目录。角色条目返回 `id / description / hidden / model / thinking`，身份语义见 [模型角色](../../docs/model-configuration.md#模型角色)。
- `resolveModelSelection(defaults, overrides)`（`contracts`）：展示与请求共用的模型／思考等级覆盖计算，空值沿用默认值。模型、角色与凭据的可用性由消费边界校验；思考等级的发送规则见[模型配置](../../docs/model-configuration.md#输入能力与思考等级)。
- `models.validate(request, { content? })`：校验模型目标、续接资料与文件引用资格，不发送网络请求。
- `models.stream(request, { content? })`：执行单次模型请求（支持可选 `tools` 声明、`maxOutputTokens`、`userAgent`、`sessionId`），流式交付正文、思考、工具调用与终态协议事件；工具执行、结果配对及续轮由消费者负责。`finish.timing`（API 8.6）可携带请求计时，与 usage 一起按 `ModelCompletion` 保存。
- `models.run(request)`：绑定具体资源对象（`object`）与请求起点（`requestParentId`），执行一次模型请求及该响应的完整资源工具批次，经 `ModelRunObserver.event` 同步交付 `block`（最高序号块内含 `completion` 终态）、`diagnostic` 与 `progress`。终态包含 `usage`、可选 `timing` 和具型 `extensions`；结果的 `timing` 提供当次实测计时，无终态时也可瞬态消费。外层多轮循环与时间线提交由调用方插件自行驱动。
- **错误详情**：`contracts` 导出 `ErrorDetails / errorDetailsSchema / describeError`；`run` 的失败结果与 `diagnostic` 可携带 `details`，诊断的 `origin: model | software` 区分模型执行与软件处理边界。`stream` 抛出的异常可经 `describeError(error)` 取得详情，模型适配异常同时声明 `origin`。字段与保存边界见 [错误详情](../../docs/runtime.md#错误详情)。
- **终态领域扩展（API 11.0）**：调用方通过 `completionExtensions(context)` 同步读取最终系统提示与工具声明的独立副本，返回 `present(DataContract, data)` 数组。宿主将它随终态块交付，领域消费者用 `completionData(completion, DataContract)` 读取，未知或无法解码的扩展返回 null，公共计量仍可读取。完整边界见 [请求诊断](../../docs/runtime.md#请求诊断)，可编译示例见 [`examples/model-completion.ts`](examples/model-completion.ts)。

### 7. 提供商与用量目录（API 10.0）

`contracts` 导出 `ModelProviderPreset`、`ModelProviderPresetContribution`、`UsageItem` 及对应 schema；`runtime` 导出 `UsageProvider`（`QueryUsageProvider | HeadersUsageProvider`）、对应上下文、`UsageQueryError`、`ModelProviderServices`、`UsageProviderServices`。通过 `ModuleContribution.usageProviders / modelProviderPresets` 贡献实现和预设，编译示例见 [`examples/provider-usage.ts`](examples/provider-usage.ts)。

修改其他插件预设时，通过公共包导入建立对提供方插件的依赖。例如依赖 `@asterism/builtin-api` 的插件可导入 `builtin`，在 `definePlugin` 中声明 `dependencies: [builtin.id]`，贡献：

```ts
modelProviderPresets: [{
  type: "patch",
  id: "zai-plan-cn",
  patch: { connection: { usage: "my-glm-query" } },
}]
```

`my-glm-query` 是该插件同时注册的查询 ID。patch 不修改已有连接；身份、合并与生命周期规则见 [提供商贡献](../../docs/plugin-sdk.md#提供商与用量目录api-100)。

后台消费者从目录显式组合调用：

```ts
const connection = plugin.modelProviders.get(connectionId);
const usage = connection?.usage ? plugin.usageProviders.get(connection.usage) : null;
if (connection?.enabled && usage && usage.source !== "headers") {
  const credential = await plugin.modelProviders.credential(connection.id, { signal });
  const items = await plugin.usages.query(usage.id, {
    connection: { id: connection.id, endpoint: connection.baseUrl },
    credential, signal,
  });
  // 消费者保存、展示或进一步处理 items。
}
```

`modelProviders.list / presets`、`usageProviders.list` 提供目录；两者的 `subscribe` 通知变更，关闭时自动清理。凭据仅经后台 `modelProviders.credential` 显式读取；registry 不代选连接、缓存结果或轮询。消费者用自己的具型调用和事件向前端交付状态。内置实例见 `packages/builtin/src/providers/`（提供）和 `packages/builtin/src/usage/`（消费）。

API 14.0 的 `modelProviders.credential(id, { signal? })` 读取当前连接凭据；连接信息和模型响应的 `connection` 以 ID 标识，模型请求在开始时取用连接配置与凭据。消费规则见 [提供商与用量目录](../../docs/plugin-sdk.md#提供商与用量目录api-100)。

响应头来源使用 `source: "headers"` 和同步 `parseHeaders`，参见 [`examples/provider-usage-headers.ts`](examples/provider-usage-headers.ts)。返回 null 表示本次没有新数据，返回空列表明确清空。来源不限制结果类型；示例通过响应头提供 balance，内置 OpenAI／Anthropic／xAI 提供 `category: "rate_limit"` 的 quota。query 提供方可省略 source。

`models.stream` 的 `finish.response` 和 `models.run` 返回值的 `response` 携带通用响应元信息。发起者取得结果后自行调用 `parseHeaders`，模型服务不访问用量目录，也不另设响应回调或广播。消费示例见 [`examples/consume-usage.ts`](examples/consume-usage.ts)，响应元信息契约见 [运行时](../../docs/runtime.md#响应元信息)。

仅列出连接的 dashboard 可以主动调用 query 来源；headers 来源需要模型调用结果，通常由 Agent 消费。目录提供解析实现，不提供其他插件的响应或缓存。

使用类实现提供方时，分别声明 `implements QueryUsageProvider` 或 `implements HeadersUsageProvider`；`UsageProvider` 是两者的联合类型，不能直接用于类的 implements。

### 8. 网络提供方与 Web 服务（API 18.0）

- `ModuleContribution.webProviders` 贡献 `WebProviderDefinition`，包括类型 slug、能力、URL patterns、内部端点、凭据声明与同步实例工厂。
- `plugin.webProviders.types / list / get` 分别读取类型与已添加配置；`resolve(id, { signal })` 取得保持本次凭据的 `WebProviderInstance`；`subscribe` 观察目录或配置变化。
- `plugin.web.search(request, { signal })` 使用首个启用的搜索提供方；`plugin.web.fetch(request, { signal })` 按配置与 patterns 的列表顺序分派。
- `WebResponse` 的公共内容、`Presentation[]` 领域数据和 `hints` 共同组成结果；提供方通过 `present(DataContract, value)` 交付具型数据。Web 服务本身不缓存结果。
- `plugin.usages.query(id, context) / parseHeaders(id, context)` 承担无状态用量调用，`plugin.usageProviders` 承担提供方目录；消费者负责自己的刷新与展示状态。

完整契约见 [Web 资源](../../docs/web.md)，可编译的类型注册示例见 [`examples/web-provider.ts`](examples/web-provider.ts)。
