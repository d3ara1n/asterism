# 插件 SDK

`@atelier/sdk` 定义宿主与插件共用的契约。宿主实现服务，插件贡献模块、资源、工具和具名生命周期成员。SDK 基础围绕工作台、会话与时间线；读取其他领域的事件时，插件仍须引入该领域的纯契约。

契约和组合规则见 [插件 SDK 与功能组合](../../docs/plugin-sdk.md)。本文是作者入口；代码迁移和验收状态以 [插件计划](../../plans/todo-2026-10-12-plugin-system.md) 的当前任务为准，未完成项不表示已交付。

## 入口

| 入口 | 内容 |
| --- | --- |
| `@atelier/sdk/contracts` | JSON、数据／资源／创建／动作／工具／记录契约、工作台快照、模型协议类型；不依赖 Node 或 React |
| `@atelier/sdk/runtime` | 插件／模块装配、资源／创建／动作／工具实现、读取／执行门面与宿主服务接口；后台可使用 Node |
| `@atelier/sdk/renderer` | 卡片、工具视图、创建入口（`creationEntry`）与插件偏好的作者接口；React 由宿主共享 |

后台默认导出 `definePlugin(...)`，模块用具名 `setup` 作为装配入口。它取得宿主能力并向普通业务模块注入所需的窄接口，再返回功能贡献。插件只导入 SDK 和自己的依赖；宿主内部服务、资源控制器和物理会话节点不是外部 API。内置与外部模块使用同一套贡献接口。

[后台作者用例与类型反例](examples/author.ts) 和 [前端作者用例](examples/renderer.ts) 直接引用公开 SDK，随项目 `npm run typecheck` 检查，只编译，不执行插件或请求模型。

```ts
import { z } from "zod";
import { defineRecord, pluginNamespace } from "@atelier/sdk/contracts";
import { defineModule, definePlugin } from "@atelier/sdk/runtime";

const ns = pluginNamespace("example.journal");
const Entry = defineRecord(ns.name("entry"), {
  schema: z.object({ text: z.string() }),
});

export default definePlugin({ namespace: ns, version: "1.0.0", modules: [
  defineModule(plugin => ({
    records: [Entry],
    observers: [{ id: "journal", committed(event) {
      const entry = event.snapshot.records.first(Entry, { scope: "timeline" });
      if (entry?.status === "known") plugin.log.info(entry.data.text);
    } }],
  })),
] });
```

## 会话、资源与提交

`plugin.session(id)` 提供固定快照、当前会话数据读写、同步提交与标题覆盖。记录追加沿提交时的当前时间线末端进行，此前取得的只读快照不决定追加位置。`plugin.object(ref)` 绑定本插件对象，提供当前对象数据读写、关联对象的事件提交和二进制流。引用只是地址，宿主每次检查真实归属、会话与有效性；普通写入还要求对象在当前时间线上。资源创建中的对象门面由宿主提供，数据和事件写入加入创建事务。`object.snapshot()` 读取该调用绑定的资源身份、标题与数据；已授权工具使用捕获快照，执行期间保留对该对象的提交能力，结束后对象提交、嵌套会话修改和流发布都失效。

两种 `commit` 都可同时 `writer.set(DataContract, value)` 和 `writer.append(RecordContract, data)`：前者覆盖当前会话或对象数据，后者追加本插件声明过的记录。模块及资源的 `records` 声明决定可写记录，宿主使用声明的 schema 校验，填节点身份、父指针与对象关联。提交回调须同步完成；Promise 导致回滚，回调结束后的 writer 失效。嵌套同会话提交加入外层事务，失败的内层写入回滚，通知仅在最外层提交成功后派发。

快照是固定位置的观察柄，构造时捕获路径末端、会话追加上界和标题，不物化历史；`records.*` 与 `resources.*` 按需读取，首次查询晚于后续提交也不改变原快照。`position.nodeId` 给出捕获位置；执行体投影上下文时自行截取合理位置。`session.get` 和 `object.get` 读取当前数据；数据按会话、对象作用域和具型契约隔离，随会话保存，不能据此恢复历史。数据契约使用 `ns.data(name, schema)`，记录使用 `defineRecord(id, { schema })`，均不要求手填版本。读取按所属类型的 schema 解码；兼容数据继续读取，不兼容数据明确不可用或保留 unknown。插件用自己的 schema 兼容旧形状并负责迁移，读取不修改原始记录。纯数据提交通知视图，不追加时间线或触发事件观察者。

`snapshot.records.first(Contract, {scope}) / last(Contract, {scope})` 在固定范围内按契约定位，只解码目标记录；返回 null／known／unknown，损坏的首尾记录不跳过。`query` 解码所有匹配记录，`all` 才物化指定范围的全部原始信封。`scope: "timeline"` 读取从根到快照末端的完整祖先路径，末端不必是树的叶子；`scope: "session"` 按保存顺序读取快照上界内全会话的记录，包含其他分支。`first / last` 取各自范围内的首尾匹配记录，记录 `sequence` 始终是会话内从 1 开始的保存顺序，不因时间线筛选重新编号。`session.title.set(text)` 直接覆盖标题，在 `commit` 内调用时随该次提交生效；宿主不解释或自动追加命名来源事件。

`SessionObserver` 的 `committed` 与 `cursorChanged` 是独立可选入口。前者接收新增记录与固定快照，只在记录提交时调用；后者接收固定快照与会话门面，只在执行游标变化时调用，正常追加、回溯与分叉选择使用同一形状。一次外层事务只通知最终位置，回滚、选择相同位置、纯数据／标题写入、布局与只读查询不触发游标观察。两个入口同步执行，观察者内的后续提交排队派发；快照不随派生值同步改变，也不应依赖观察者先后顺序。

需要保存历史派生当前值的模块可以在 `cursorChanged` 中按当前路径重建。例如命名模块只提交自身命名事件，再按当前路径最后一条事件同步标题；上下文等即时投影无需维护派生当前值。观察失败只记录日志；队列清空后发布界面变化通知。

资源通过 `implementResource` 聚合 `project / inspect / context`、可选创建实现和动作实现集合。`defineCreation / defineAction` 在纯契约中声明身份、关联资源与输入 schema，`implementCreation / implementAction` 绑定具型实现。外部准备者通过 `implementPreparer` 绑定具体动作，按装配顺序处理后进入资源自己的准备；替换只能改变同一动作的输入。

schema 支持默认值、去空白与转换。调用方提交 schema 的输入类型，准备与执行接收输出类型；两侧均为 JSON 值。每份新输入由宿主解析一次。创建与动作准备均返回 `accept / replace / reject`：接受沿用解析结果，替换提交新的原始输入并解析一次，拒绝终止处理。执行层不再解析。默认值示例和字符串转数字的类型反例见 [作者用例](examples/author.ts)。

投影、检查、环境读取、链接说明和准备取得 `ObjectReader`，其 `session` 也是只读接口。创建、动作和授权工具执行取得 `ObjectExecutor`，遵守已有事务与有效期。动作按对象排队，创建进入宿主事务；任务、动作和模型调用共用宿主内部的活动登记、取消与收束机制。

工具通过 `implementTool` 消费 `ImplementationContract`，宿主将它适配到同一个工具目录和授权执行路径。参数、产出和过程发布经过 schema 校验；工具支持关系不构成授权。

`defineTool` 声明 `id / name / description / guidelines / argsSchema`；`name` 用于模型寻址，稳定 ID 用于标识。实现与外部准备者必须引用实际的工具／动作声明；重复引用同一记录声明允许，重新定义同 ID 的对象会冲突。工具名称覆盖与实例共享分别处理：不同身份的同名工具按插件列表取最后声明，同一声明的多个资源实现保持生效。宿主不以相同 ID 合并副本，也不做 schema 指纹或函数等价性检查。

## 公开模块与共享实例

提供方在 package.json 声明标准公共子路径，文件名由作者决定：

```json
{
  "name": "@example/tools",
  "exports": { "./public": "./src/public.ts" },
  "atelier": {
    "id": "example.tools",
    "api": { "major": 7, "minMinor": 0 },
    "runtime": "./src/runtime.ts"
  }
}
```

```ts
// 提供方 src/public.ts；可以转导出内部模块已有的对象。
export { Read, settings, service } from "./shared.ts";

// 消费方：在 dependencies 或 peerDependencies 声明 @example/tools。
import { Read, settings, service } from "@example/tools/public";
```

公共入口也可以用标准 node／browser／import／default 条件导出；types 可指向类型声明。TypeScript 沿正常包导出读取类型，宿主从已登记并启用的提供方解析实际源码。安装及版本范围求解由包管理器负责，本地开发可使用 workspace 或链接依赖；宿主不隐式安装其他包，也不读取消费者私有副本替代提供方。

同一运行环境中，提供方内部引用与所有消费者取得同一个实际对象、函数或类，公共入口的 re-export 保留这种关系。配置与状态的公开形式由提供方决定；有生命周期的服务在提供方 setup 中初始化，消费者 setup 之后执行，关闭按相反顺序。模块顶层只应依赖模块本身已初始化的导出，不依赖尚未执行的插件 setup。缺失、禁用、重复公共包名、声明冲突和循环初始化依赖明确失败。

后台与前端各有自己的模块实例；共享对象不跨进程。公共模块可以只提供导出而没有 runtime／renderer 入口，仍须登记并启用。具型事件通过宿主的全局通信机制跨进程投递，通用调用留待有实际需求后设计。

观察者消费提交时的固定快照；它产生的新提交按顺序排队，异常隔离。耗时任务用 `plugin.tasks.start`，以 key 去重并通过 `has / cancel` 查询和取消；可绑定本插件对象，使任务计入该对象的执行进度与收束检查。成功 setup 的 `closing` 清理立即登记，后续装配失败或正常关闭均取消工作并等待、按逆序清理；setup 返回前失败自行清理尚未交付的设施。`plugin.catalogs.get` 按领域数据契约读取只读目录；Agent 配置目录由 core 声明，模型与角色目录由模型服务提供。

## 全局具型事件

纯契约以 `ns.event(name, { schema, source, semantics })` 声明，归属插件在 `ModuleContribution.events` 登记。source 为 `plugin / resource / any`；`occurrence` 按次消费，`snapshot` 声明同键完整替代语义及顶层标量 key 字段。契约、发布输入与订阅载荷的类型由 schema 推导。

后台 `plugin.ipc.events.publish(contract, data)` 发布插件级事件，`object.events.publish(contract, data)` 绑定资源来源；来源由宿主生成，载荷里的关联对象不改变 stamp。`plugin.ipc.events.subscribe(contract, { delivery?, source?, signal? }, handler)` 默认全局逐条消费，快照契约可选 latest 合并。setup 可以先订阅再返回声明，ready 在装配成功后生效。

前端 `prepare({ events })` 可建立不依赖卡片挂载的模块订阅，失败、超时或应用关闭时自动取消；组件以 `useRendererEvents()` 取用接口，自行在 effect 清理时 close。订阅提供 ready、closed 与 close，handler 接收具型信封及取消信号。每个订阅按序投递、期间不丢事件，失败和断连明确结束。事件不参与事务，调用即投递。事件不写历史、不保留供晚订阅读取的状态，领域自行恢复当前值。

[事件作者示例与类型反例](examples/events.ts) 随 typecheck 检查；完整来源与投递约定见 [插件 SDK](../../docs/plugin-sdk.md#瞬态事件与插件调用)。通用事件入口要求 API 7.1。API 7.2 增加宿主登记的公共 `ResourceStatusChanged`，资源直接发布 `{ title: UiText, status: "running" | "failed" | "awaiting" | "completed" }`，running 可附带 `progress: { value: number }`（0～1），终态不能携带进度，不在自己的 events 中重复登记。状态采用资源级 snapshot（key 为空），四种状态均以最新完整值替换旧值；外壳以 latest 消费并聚合为会话 badge，进入会话只清除终态，running 及进度保留。不提供 reset、撤回或恢复查询。

## 插件配置

在纯契约中用 `ns.config(schema, defaults)` 声明本插件唯一的配置契约，后台以 `plugin.config(contract)` 取得 `get / update / subscribe`，前端以 `useRendererConfig(contract)` 读取；装配位置向业务模块注入所需分组的当前值读取和更新接口。更新基于最新完整配置，不缓存整份旧值覆盖其他分组。默认值须通过原始 schema 和 JSON 校验；重复调用须传入同一契约实例。数据保存于插件目录的 `.atelier/config.json`，凭据通过 `secrets` 保存。

设置页只展示已加载且声明了配置的插件，按插件分组。Zod 的 `.meta({ title, description })` 提供表单标题与字段说明；宿主使用输入 JSON Schema 选择字符串、数值、开关和枚举控件，必需的嵌套对象按字段分组。可选对象、数组、动态对象、联合、引用及不能投影的 schema 使用完整 JSON 值编辑，不推断另一套领域结构。所有保存仍由原始 Zod schema 校验，包括不能在 JSON Schema 表达的 refinement；失败保留草稿与原文件。

配置读取、保存与恢复默认使用独立 IPC，不重读会话或重启插件。`get()` 读取当前值；插件若自行缓存值，更新时机由它负责。恢复默认先修改界面草稿，保存时移除配置文件并取用声明默认值；不清理插件数据库、凭据或其他文件。损坏文件读取时保留并显示默认值，界面说明这一状态，明确保存或恢复后才替换。作者用例见 `examples/author.ts` 的 Counter 配置。

## 前端对象接口

内容能力以 `contentRefSchema` 嵌入业务 schema，宿主从最终写入值自动登记依赖。准备统一为 `prepare(input, { signal, content, object? })`；执行与创建中的 `object.content` 可读取与 `stage`，外部准备者与会话门面只读。前端拖放文件统一为 `DropItem.kind: "file"`（`file` 必有，`path` 可选，需路径时声明 `requiresPath`）；`toInput(item, content)` 与 `InputView` 取得宿主管理的草稿，卡片动作通过 `object.input(contract)` 与 `{ content: draft }` 携带，成功后宿主关闭草稿。用法总表见 [插件 SDK](../../docs/plugin-sdk.md#不可变内容)，作者示例见 [内容契约声明](examples/content-contract.ts)、[后台实现](examples/content-author.ts)、[前端入口](examples/content-renderer.ts)。

`cardRenderer` 校验卡片载荷并向 Body 与 Actions 注入对象环境，组件通过 `useRendererObject()` 取得基础对象接口。`session.snapshot()` 提供具型记录与资源快照，`session.create(CreationContract, input, position)` 创建资源，`invoke(ActionContract, input)` 调用当前对象动作。`onStream` 订阅对象二进制通道，短名由宿主补全插件命名空间。基础接口提供通用运行状态；临时模型块经专门接口按需取用，实时块始终对应当前执行状态，卡片不接收历史模式或返回实时视图接口。

`toolRenderer` 的 input、execution、result 是三个平行可选入口，每个都使用 `{ headerRenderer?, bodyRenderer? }`。例如三态共用组件时：

```ts
const view = { headerRenderer: Header, bodyRenderer: Body };
toolRenderer(WriteContract, {
  label: "Write", input: view, execution: view, result: view,
});
```

组件可用 `ToolRenderProps<D, T, A>` 覆盖三态，或使用 `ToolInputRenderProps / ToolExecutionRenderProps / ToolResultRenderProps` 定义单阶段组件。input 收到部分 JSON 和 `result: null`，字段读取必须检查类型；execution 接收已校验参数，phase 为 ready/executing；result 的 phase 为 settled，结果必为终结结局。完整参数与执行产出继续通过契约校验。省略 input 时显示静态准备提示；execution/result 缺少入口时独立回退，不隐式复用其他阶段。详见 [视图契约](../../docs/plugin-sdk.md#工具视图)。

[可编译的作者示例与类型反例](examples/tool-renderer.ts) 验证跨阶段复用、部分参数与结局收窄。内置 [目录视图](../../src/modules/filesystem/renderer.tsx) 和 [正文视图](../../src/modules/text-view.tsx) 共用三态声明，header 保留路径及字数，body 按 phase 展示尾部或结果。宿主管理开合与原始详情，工具外壳不限高，body 提供方自行控制局部高度、滚动、分页、截取与渲染量；视图尽可能保持目标、数量和样式连续，逐步补充内容。内置插件的 120 行正文预算不作为 SDK 对外部插件的强制要求。

二进制流的宿主信封由 main 与 preload 共用 Zod schema 校验，preload 按会话与对象筛选订阅。载荷保留 `Uint8Array`，支持空帧与具有偏移的视图，不转换为 JSON，也不写入时间线；无效信封不交付插件。

宿主协调读取、命令门禁和错误状态。模型进度、配置目录与工具展示分别通过 `useRendererModels / useRendererCatalogs / useRendererTools` 取得，共用已有宿主状态源；`useRendererNavigation` 提供导航，聚合视图将具体操作传给内容模块。草稿和提交身份归交互模块，按会话与对象绑定并跨卡片重挂载保留；重试相同输入保留身份，受理后清除。导航显式注入。资源后台的 `links.receive` 与前端静态描述的 `receivesLinks` 声明接收链接，授权仍由执行层检查真实链接。

## 可选界面本地化

本地化唯一消费者是普通用户；按内容服务谁判断，不按代码所在位置或是否显示在窗口中判断。用户操作、说明、状态与恢复建议采用本机制，日志、异常栈、开发工具、协议标识与模型提示／工具协议使用原文，不维护译文。配置表单的说明面向普通用户；其中的提示词、原始 JSON 和用户正文保持原值。完整范围见 [消费者与本地化范围](../../docs/i18n.md#消费者与本地化范围)。

普通字符串原样显示，单语言插件无需目录或翻译初始化。需要翻译时，用纯 contracts 入口声明默认文案；消息 ID 为插件内部的稳定键，namespace 在声明时绑定 owner 与来源语言：

```ts
import { defineMessages, pluginNamespace, withValues } from "@atelier/sdk/contracts";

const ns = pluginNamespace("example.counter");
export const messages = ns.messages("en", defineMessages({
  title: { id: "counter.title", defaultMessage: "Counter" },
  items: { id: "counter.items", defaultMessage: "{count, plural, one {# item} other {# items}}" },
  limit: { id: "counter.limit", defaultMessage: "Limit" },
}));
const label = messages.title; // 也可以继续使用普通字符串 "Counter"。
const summary = withValues(messages.items, { count: 3 });
```

ResourceDescription、ToolView、CreationEntry 的 label／description 接收 UiText；静态声明直接保存描述，组件在 render 中用 `const i18n = useI18n()` 后调用 `i18n.text(label)` 或 `i18n.formatMessage(messages.items, {count: 3})`。hook 来自 `@atelier/sdk/renderer`，不要求绑定卡片对象。数字和日期接口遵循有效地区语言；ICU 内的格式化遵循实际文案语言。富文本使用 `UiFormattedMessage`，映射函数只留在 React 中，不放进 UiText 或 IPC。

翻译目录在包的 `atelier.i18n.catalogs` 中显式列出，例如 `{ "zh-Hans": "./locales/zh-Hans.json" }`；目录内容为 `{ "counter.title": "计数器" }`。无需源语言目录，部分翻译逐条回退默认文案。公共导出的消息保留提供方 owner；没有 renderer 的包也能交付静态目录。React 与 react-intl context 由宿主提供共享实例，插件不初始化另一套全局语言状态。

配置契约可用第三个可选参数：`ns.config(schema, defaults, { presentation: { fields: { "/limit": { title: messages.limit } } } })`。固定对象字段使用 JSON Pointer，根为 `""`，`/` 与 `~` 分别转义为 `~1` 与 `~0`；数组和动态字段继续整体 JSON 编辑。展示映射不改变后台校验，语言切换也不重读配置或重置草稿。错误的 code 用于分支，英文 message 用于诊断，可选 display 持有 UiText；准备拒绝的业务原因码与 display 会进入命令回执，已有纯字符串提示仍有效。

完整纯声明与后台配置用例见 [i18n 作者示例](examples/i18n.ts)，语言与回退契约见 [公共 i18n](../../docs/i18n.md)。项目的 `npm run i18n:extract -- /path/to/plugin` 用真实 FormatJS CLI 抽取标准声明到插件根的 `.i18n/`，`npm run i18n:check -- /path/to/plugin` 检查 ICU、参数及冲突并报告覆盖率；未翻译条目不使外部插件失败。保持 defaultMessage 在交付物中，默认文案始终提供可读回退。

## 版本与当前边界

SDK 包版本为 `0.12.0`，宿主提供 API 7.2；使用公共资源状态的插件声明 `api: { major: 7, minMinor: 2 }`，通用事件接口要求 minMinor 1。同主版本旧插件继续可用，其他主版本或更高小版本在加载前拒绝。应用 IPC 版本为 5，会话 IPC 为 18，内容 IPC 为 3，应用配置 IPC 为 3，插件配置 IPC 为 2，插件事件 IPC 为 1；工作数据库格式为 18，应用配置文件格式为 2。

资源创建数据必须是 JSON 对象，不能占用宿主的 `id / type / title` 字段。当前会话数据保存于 `session_data`，事件及工具结果保存稳定契约身份与原始数据。core 消费具型用户消息、模型执行、通知与环境记录，存储编码由宿主负责；环境记录保留原事件身份与载荷。

内置插件与打包验收、core 领域共识包、通用跨插件调用、跨进程通信与包管理的后续能力见 [插件计划](../../plans/todo-2026-10-12-plugin-system.md)。core 领域共识包是确定延后的任务，不包含 core 运行时实例。

## 可选模型分支

模型输入及 context 均使用 `parts: ModelInputPart[]`，文字为 `{ kind: "text", text }`，文件为 `{ kind: "file", file: ContentRef, mediaType, filename? }`；mediaType 如实标注，不建模输入模态。输入不携带字节或路径。`models.validate(request, { content })` 和 `models.stream(request, { content })` 接收准备阶段、对象或会话已有的宿主 ContentReader；含文件时必须提供，纯文字可省略。模型消息与运行时门面分别传递，内容资格不进入持久消息。可编译示例见 [模型输入](examples/model-input.ts)。

validate 检查目标、续接、文件类型、归属与大小，不读取全部字节。实际请求独立捕获资格与内容占用、重新检查并读取字节；调用方须消费或关闭流，宿主关闭也会收束流。请求不关闭借来的 content，草稿关闭不撤销已经捕获的请求。

`models.roles / list` 读取模型与角色目录。`models.validate` 检查目标与显式输入能否准备，不发送请求或写入数据。`models.stream` 提供一次补全，只消费显式输入并交付协议事件；终态附带实际模型、适配版本与协议作用域。会话命名使用 stream，无须对象或资源工具执行。

`models.run(request)` 是一次补全及该响应的完整资源工具批次。每次提供 `object / requestParentId / target / system / messages / signal / observer`，可提供工具筛选与缓存命中预期。宿主校验对象归属、当前路径与请求起点，按本对象当前数据和请求路径记录解析 file 部件，不接收外部 content 覆盖；按真实链接固定授权视图，并取用链接资源提供的环境文件追加到本次系统提示；工具筛选只收窄权限。同一对象并发 run 拒绝，运行期间对象和历史须遵守收束规则，关闭时取消并等待批次结束。

具名 `ModelRunObserver.event` 同步收到 `block / diagnostic / progress`。正文等响应终态齐全后交付，工具块等取得工具结局后交付；终态直接保存在最高 ordinal 块的 `completion` 字段中，不另发 completion 事件。异常收束时也保留已收到的块，不完整内容由 `complete=false` 标记，未报告的终态不补造；无块响应的来源与计量保存在 `empty_response` 诊断内。临时进度不写历史。`modelRunRecordSchema` 提供可保存事件的共识载荷，插件用它声明自己的 RecordContract，并经 `ObjectExecutor.commit` 保存；所有 append 都由宿主沿当前游标原子追加并推进游标，无 audit 选项。run 不隐式保存输出，也不读取、保存或续接内部对话。消费者失败时取消执行并收束工具，返回 `event_delivery`，不再调用该消费者。

返回结果包含终止原因、来源、终态和按模型调用顺序排列的工具结局。取消、失败与未知写入影响要求 Agent 停止自动继续。run 完成工具批次即返回，上层插件的 Agent 决定是否再次调用、维护轮数和预算，每次消息都从时间线重新投影。Agent 可以持有非 context 状态；context 的唯一真值在时间线，不能在 Agent 或 run 内保存另一份历史。

`cache.expectHit` 是本次请求的诊断预期，结合 provider 报告的用量判断缓存未命中；不证明支持显式缓存，也不提供隐式缓存会话。更多缓存控制留在未来任务中，所需状态仍须显式输入、输出。
