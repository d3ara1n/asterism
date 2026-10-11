# 插件 SDK

`@atelier/sdk` 定义宿主与插件共用的契约。宿主实现服务，插件贡献模块、资源、工具和具名生命周期成员。SDK 基础围绕工作台、会话与时间轴；读取其他领域的事件时，插件仍须引入该领域的纯契约。

## 入口

| 入口 | 内容 |
| --- | --- |
| `@atelier/sdk/contracts` | JSON、数据／资源／工具／记录契约、工作台快照、模型协议类型；不依赖 Node 或 React |
| `@atelier/sdk/runtime` | `definePlugin`、`defineModule`、`implementResource`、`implementTool` 与宿主服务接口；后台可使用 Node |
| `@atelier/sdk/renderer` | 卡片与工具视图的作者接口；React 由宿主共享 |

后台默认导出 `definePlugin(...)`，模块用具名 `setup` 入口。插件只导入 SDK 和自己的依赖；宿主内部的 `src/plugins/contract.ts`、资源控制器和物理会话节点不是外部 API。

[完整作者用例与类型反例](examples/author.ts) 直接引用公开 SDK，随项目 `npm run typecheck` 检查，只编译，不执行插件或请求模型。

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

`plugin.session(id)` 提供固定快照、同步事件提交和标题比较更新。`plugin.object(ref)` 绑定本插件对象，提供具型状态读写、关联对象的事件提交和二进制流。引用只是地址，宿主每次检查真实归属、会话与有效性；写入还要求对象在当前路径上。资源创建中的对象门面由宿主提供，状态和事件写入加入创建事务。

`SessionHandle.commit` 只追加本插件声明过的记录；`ObjectContext.commit` 可同时 `writer.set(DataContract, value)` 和 `writer.append(RecordContract, data)`。模块及资源的 `records` 声明决定可写记录，宿主使用声明的 schema 校验，填节点身份、父指针与对象关联。提交回调须同步完成；Promise 导致回滚，回调结束后的 writer 失效。嵌套同会话提交加入外层事务，失败的内层写入回滚，通知仅在最外层提交成功后派发。

快照的路径、记录和资源数据固定在读取时刻。私有状态读取当前值，不承诺历史恢复。不持有领域契约的消费者可以保留和定位原始信封；解码结果为 `null`、`known` 或 `unknown`，未知版本、坏数据和升级失败不改写原始记录。

资源通过一个 `implementResource` 提供 `project / inspect / context`，内联可选的 `creation` 与 `actions`。创建先准备输入，再在宿主事务内执行 `create`。动作先执行外部 `CommandPreparer`，按装配顺序串行，然后进入资源自己的 `actions.prepare`；每次替换均按目标资源的 schema 重新校验。`actions.execute` 接收绑定对象与取消信号，宿主维护活动状态并在关闭时取消与等待收束。

工具通过 `implementTool` 消费 `ImplementationContract`，宿主将它适配到同一个工具目录和授权执行路径。参数、产出和过程发布经过 schema 校验；工具支持关系不构成授权。

观察者消费提交时的固定快照；它产生的新提交按顺序排队，异常隔离。耗时任务用 `plugin.tasks`；模块自己的设施在具名 `closing` 中收束。

## 当前边界

后台主干与单次模型执行已接通。当前事件和对象状态沿用现有存储，只支持写入版本 1；更高版本明确拒绝，版本编码留到对应存储批次确定。资源创建数据必须是 JSON 对象，不能占用宿主的 `id / type / title` 字段。既有模型块已映为共识载荷，包含来源、请求起点、续接与合并终态；core 领域投影和事件可见性的完整迁移仍随内置迁移推进。

工作台链接规则保持现状，资源的静态接收声明留到内置迁移批次。renderer 的创建、动作、事件读取与流订阅门面尚未接通；当前 renderer 入口仍主要提供展示接口。

内置目录后台已消费公开 SDK；笔记、命名和 Agent 尚用宿主内部工厂，装配器承接迁移期间的混合模块。外部包只能导出 SDK 模块描述。配置表单、core 领域共识包、具型跨插件调用、共享实例、通信与包管理的后续能力见 [插件计划](../../plans/todo-2026-10-12-plugin-system.md)。core 领域共识包是确定延后的任务，不包含 core 运行时实例。

## 可选模型分支

`models.roles / list` 读取模型与角色目录。`models.stream` 提供一次补全，只消费显式输入并交付协议事件；终态附带实际模型、适配版本与协议作用域。会话命名使用 stream，无须对象或资源工具执行。

`models.run(request)` 是一次补全及该响应的完整资源工具批次。每次提供 `object / requestParentId / target / system / messages / signal / observer`，可提供工具筛选与缓存命中预期。宿主校验对象归属、当前路径与请求起点，按真实链接固定授权视图，并取用链接资源提供的环境文件追加到本次系统提示；工具筛选只收窄权限。同一对象并发 run 拒绝，运行期间对象和历史须遵守收束规则，关闭时取消并等待批次结束。

具名 `ModelRunObserver.event` 同步收到 `block / completion / diagnostic / progress`。成型块与迟到终态分开交付，部分输出也有明确的完整性标志；临时进度不写历史。`modelRunRecordSchema` 提供可保存事件的共识载荷，插件用它声明自己的 RecordContract，并经 `ObjectContext.commit` 保存。run 不隐式保存输出，也不读取、保存或续接内部对话；终态的 ordinal 标出应绑定的最高序号块，空响应为 null。消费者失败时取消执行并收束工具，返回 `event_delivery`，不再调用该消费者。

返回结果包含终止原因、来源、终态和按模型调用顺序排列的工具结局。取消、失败与未知写入影响要求 Agent 停止自动继续。run 完成工具批次即返回，上层插件的 Agent 决定是否再次调用、维护轮数和预算，每次消息都从时间轴重新投影。Agent 可以持有非 context 状态；context 的唯一真值在时间轴，不能在 Agent 或 run 内保存另一份历史。

`cache.expectHit` 是本次请求的诊断预期，结合 provider 报告的用量判断缓存未命中；不证明支持显式缓存，也不提供隐式缓存会话。更多缓存控制留在未来任务中，所需状态仍须显式输入、输出。
