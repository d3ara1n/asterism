# 插件 SDK

`@atelier/sdk` 定义宿主与插件共用的契约。宿主实现服务，插件贡献模块、资源、工具和具名生命周期成员。SDK 基础围绕工作台、会话与时间轴；读取其他领域的事件时，插件仍须引入该领域的纯契约。

## 入口

| 入口 | 内容 |
| --- | --- |
| `@atelier/sdk/contracts` | JSON、数据／资源／工具／记录契约、工作台快照、模型协议类型；不依赖 Node 或 React |
| `@atelier/sdk/runtime` | `definePlugin`、`defineModule`、`implementResource`、`implementTool` 与宿主服务接口；后台可使用 Node |
| `@atelier/sdk/renderer` | 卡片与工具视图的作者接口；React 由宿主共享 |

后台默认导出 `definePlugin(...)`，模块用具名 `setup` 入口。插件只导入 SDK 和自己的依赖；宿主内部服务、资源控制器和物理会话节点不是外部 API。内置与外部模块使用同一套贡献接口。

[后台作者用例与类型反例](examples/author.ts) 和 [前端作者用例](examples/renderer.ts) 直接引用公开 SDK，随项目 `npm run typecheck` 检查，只编译，不执行插件或请求模型。

```ts
import { z } from "zod";
import { defineRecord, pluginNamespace } from "@atelier/sdk/contracts";
import { defineModule, definePlugin } from "@atelier/sdk/runtime";

const ns = pluginNamespace("example.journal");
const Entry = defineRecord(ns.name("entry"), {
  version: 1, schema: z.object({ text: z.string() }),
});

export default definePlugin({ namespace: ns, version: "1.0.0", modules: [
  defineModule(plugin => ({
    records: [Entry],
    observers: [{ id: "journal", committed(event) {
      const entry = event.snapshot.records.first(Entry, { scope: "path" });
      if (entry?.status === "known") plugin.log.info(entry.data.text);
    } }],
  })),
] });
```

## 会话、资源与提交

`plugin.session(id)` 提供固定快照、当前会话数据读写、同步提交、续接位置与标题比较更新。`plugin.object(ref)` 绑定本插件对象，提供当前对象数据读写、关联对象的事件提交和二进制流。引用只是地址，宿主每次检查真实归属、会话与有效性；普通写入还要求对象在当前路径上。资源创建中的对象门面由宿主提供，数据和事件写入加入创建事务。`object.snapshot()` 读取该调用绑定的资源身份、标题与数据；已授权工具使用捕获快照，执行期间保留对该对象的提交能力，结束后这项执行能力失效。

两种 `commit` 都可同时 `writer.set(DataContract, value)` 和 `writer.append(RecordContract, data)`：前者覆盖当前会话或对象数据，后者追加本插件声明过的记录。模块及资源的 `records` 声明决定可写记录，宿主使用声明的 schema 校验，填节点身份、父指针与对象关联。提交回调须同步完成；Promise 导致回滚，回调结束后的 writer 失效。嵌套同会话提交加入外层事务，失败的内层写入回滚，通知仅在最外层提交成功后派发。

快照的路径、记录和不可变资源数据固定在读取时刻，`position.nodeId / continuationId` 分别给出当前位置与可续接位置。`session.get` 和 `object.get` 读取当前数据；数据按会话、对象作用域和具型契约隔离，随会话保存，不能据此恢复历史。数据与事件都保存契约版本；当前数据版本不匹配时明确不可用，事件按 `RecordContract.decode` 升级或保留 unknown。纯数据提交通知视图，不追加时间轴或触发事件观察者。插件私有目录与数据库用于插件自身数据，独立于这些会话数据。

资源通过一个 `implementResource` 提供 `project / inspect / context`，内联可选的 `creation` 与 `actions`。创建先准备输入，再在宿主事务内执行 `create`。动作先执行外部 `CommandPreparer`，按装配顺序串行，然后进入资源自己的 `actions.prepare`；每次替换均按目标资源的 schema 重新校验。`actions.execute` 接收绑定对象与取消信号，宿主维护活动状态并在关闭时取消与等待收束。

工具通过 `implementTool` 消费 `ImplementationContract`，宿主将它适配到同一个工具目录和授权执行路径。参数、产出和过程发布经过 schema 校验；工具支持关系不构成授权。

观察者消费提交时的固定快照；它产生的新提交按顺序排队，异常隔离。耗时任务用 `plugin.tasks.start`，以 key 去重并通过 `has / cancel` 查询和取消；可绑定本插件对象，使任务计入该对象的执行进度与收束检查。模块自己的设施在具名 `closing` 中收束。`plugin.catalogs.get` 按领域数据契约读取宿主提供的只读目录；应用的 Agent 配置目录由 core 声明，模型与角色目录由模型服务提供。

## 插件配置

在模块 `setup` 中调用 `plugin.config(schema, defaults)` 声明本插件的一份配置，并保留返回的具型 `get / set` 对象。默认值须通过原始 schema 和 JSON 校验；重复调用须复用同一 schema 与默认值，模块共用这份配置。数据仍保存于插件目录的 `.atelier/config.json`，凭据通过 `secrets` 保存。

设置页只展示已加载且声明了配置的插件，按插件分组。Zod 的 `.meta({ title, description })` 提供表单标题与字段说明；宿主使用输入 JSON Schema 选择字符串、数值、开关和枚举控件，必需的嵌套对象按字段分组。可选对象、数组、动态对象、联合、引用及不能投影的 schema 使用完整 JSON 值编辑，不推断另一套领域结构。所有保存仍由原始 Zod schema 校验，包括不能在 JSON Schema 表达的 refinement；失败保留草稿与原文件。

配置读取、保存与恢复默认使用独立 IPC，不重读会话或重启插件。`get()` 读取当前值；插件若自行缓存值，更新时机由它负责。恢复默认先修改界面草稿，保存时移除配置文件并取用声明默认值；不清理插件数据库、凭据或其他文件。损坏文件读取时保留并显示默认值，界面说明这一状态，明确保存或恢复后才替换。作者用例见 `examples/author.ts` 的 Counter 配置。

## 前端对象接口

`cardRenderer` 校验卡片载荷并向 Body 与 Actions 注入对象环境，组件通过 `useRendererObject()` 取得它。`session.snapshot()` 提供具型记录与资源快照，`session.create` 创建资源，`invoke` 提交当前对象动作，`onStream` 订阅该对象的具名二进制通道。通道使用后台 publish 的短名，由宿主补全插件命名空间。`activity` 提供对象运行状态及临时模型块；历史查看不交付实时块。

二进制流的宿主信封由 main 与 preload 共用 Zod schema 校验，preload 按会话与对象筛选订阅。载荷保留 `Uint8Array`，支持空帧与具有偏移的视图，不转换为 JSON，也不写入时间轴；无效信封不交付插件。

宿主协调读取、命令门禁和错误状态；`view`、草稿与提交身份随对象绑定，重试相同输入保留提交身份，受理后显式清除。`catalogs` 提供具型只读配置，`tools.resolve` 取得固定操作入口及资源工具的调用视图。资源后台的 `links.receive` 与前端静态描述的 `receivesLinks` 声明接收链接，授权仍由执行层检查真实链接。

## 当前边界

资源创建数据必须是 JSON 对象，不能占用宿主的 `id / type / title` 字段。工作数据库格式为 13，当前会话数据保存于 `session_data`，事件保存独立的契约版本。core 消费具型用户消息、模型执行、通知与环境记录，存储编码由宿主负责；环境记录保留原事件身份与载荷。配置文件格式仍为 1。

内置插件与打包验收、core 领域共识包、具型跨插件调用、共享实例、通信与包管理的后续能力见 [插件计划](../../plans/todo-2026-10-12-plugin-system.md)。core 领域共识包是确定延后的任务，不包含 core 运行时实例。

## 可选模型分支

`models.roles / list` 读取模型与角色目录。`models.validate` 检查目标与显式输入能否准备，不发送请求或写入数据。`models.stream` 提供一次补全，只消费显式输入并交付协议事件；终态附带实际模型、适配版本与协议作用域。会话命名使用 stream，无须对象或资源工具执行。

`models.run(request)` 是一次补全及该响应的完整资源工具批次。每次提供 `object / requestParentId / target / system / messages / signal / observer`，可提供工具筛选与缓存命中预期。宿主校验对象归属、当前路径与请求起点，按真实链接固定授权视图，并取用链接资源提供的环境文件追加到本次系统提示；工具筛选只收窄权限。同一对象并发 run 拒绝，运行期间对象和历史须遵守收束规则，关闭时取消并等待批次结束。

具名 `ModelRunObserver.event` 同步收到 `block / completion / diagnostic / progress`。成型块与迟到终态分开交付，部分输出也有明确的完整性标志；临时进度不写历史。`modelRunRecordSchema` 提供可保存事件的共识载荷，插件用它声明自己的 RecordContract，并经 `ObjectContext.commit` 保存。run 不隐式保存输出，也不读取、保存或续接内部对话；终态的 ordinal 标出应绑定的最高序号块，空响应为 null。消费者失败时取消执行并收束工具，返回 `event_delivery`，不再调用该消费者。

返回结果包含终止原因、来源、终态和按模型调用顺序排列的工具结局。取消、失败与未知写入影响要求 Agent 停止自动继续。run 完成工具批次即返回，上层插件的 Agent 决定是否再次调用、维护轮数和预算，每次消息都从时间轴重新投影。Agent 可以持有非 context 状态；context 的唯一真值在时间轴，不能在 Agent 或 run 内保存另一份历史。

`cache.expectHit` 是本次请求的诊断预期，结合 provider 报告的用量判断缓存未命中；不证明支持显式缓存，也不提供隐式缓存会话。更多缓存控制留在未来任务中，所需状态仍须显式输入、输出。
