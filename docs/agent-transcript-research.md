# 模型接入与 Transcript 源码调研

> 调研日期：2026-10-01。固定源码快照的静态调查，未运行这些项目的测试，也不代表全部发布版本的行为。第 1—5 节为源码事实，第 6—8 节为织台设计建议；建议尚未冻结接口、存储字段或执行策略。
>
> 已确认方向：Vercel AI SDK 作为模型适配基线，上层能扩展更多协议；织台拥有可扩展的对话记录（transcript），组织用户消息、助手消息、思考与工具过程。实施任务见 [模型协议与存储立案](../plans/todo-2026-10-01-model-protocol-storage.md)。

## 1. 范围与源码版本

| 项目 | 固定提交 | 本次重点 |
| --- | --- | --- |
| pi | `badlogic/pi-mono@ed8b3bcc194c8263ec8bec3f337053ae73866da1` | 协议适配、可扩展消息、上下文转换、树状会话记录 |
| OpenCode | `anomalyco/opencode@0112a92c416f5ad833d96e7a8308441f0a875d94` | V1/V2 会话结构、内容块、事件投影、模型循环 |
| Cline | `cline/cline@8eee168b80127b0c94bad849323754b5864865e7` | 新版 SDK 的消息转换、provider handler、持久化契约 |
| Codex | `openai/codex@a933dd77dbe101d7bd746ea3c7d1f8174eca4a05` | 模型项目/轮次项目/持久化记录分工，工具执行与恢复 |
| Vercel AI SDK | `vercel/ai@45e1fbc3ea10d22f852e12b1c1851e289c85e835` | 协议接口、provider 注册、应用消息到模型消息的转换 |

这里调查的是源码快照，不将 upstream main 中的接口版本等同于当前 npm 稳定版；织台安装依赖前仍需核验版本。pi 源码来自 `badlogic/pi-mono`，不假定与本机 `@earendil-works/pi-coding-agent` 发行完全相同。

OpenCode 同时存在 V1 与 V2 路径，Cline 已有 `apps/` 与 `sdk/` 结构。旧文章中的路径不能直接用来描述当前源码。下文明确讨论的具体路径，不推断整个项目已经完成迁移。

## 2. pi：应用消息先组织，再转换成模型消息

### 类型与适配

[packages/ai/src/types.ts](https://github.com/badlogic/pi-mono/blob/ed8b3bcc194c8263ec8bec3f337053ae73866da1/packages/ai/src/types.ts) 定义 `KnownApi | (string & {})`，允许扩展协议标识；协议实现分布于 `packages/ai/src/api/`。`Message` 是 system/user/assistant/toolResult 的联合；assistant 的内容包含 text、thinking、toolCall，签名等续接字段在对应块上。

[packages/ai/src/models.ts](https://github.com/badlogic/pi-mono/blob/ed8b3bcc194c8263ec8bec3f337053ae73866da1/packages/ai/src/models.ts) 的 `createProvider()` 将服务地址、模型集合和流函数组装为 provider，`Models.setProvider()` 负责注册。服务配置与实际协议流函数可以组合。

[packages/agent/src/types.ts](https://github.com/badlogic/pi-mono/blob/ed8b3bcc194c8263ec8bec3f337053ae73866da1/packages/agent/src/types.ts#L356) 使用 TypeScript 声明合并开放 `CustomAgentMessages`：

```ts
interface CustomAgentMessages {}
type AgentMessage = Message | CustomAgentMessages[keyof CustomAgentMessages];
```

应用消息可以比模型协议消息丰富。`AgentLoopConfig` 提供 `transformContext(AgentMessage[])` 和 `convertToLlm(AgentMessage[])` 两步；前者整理上下文，后者转换为模型接受的 `Message[]`。自定义消息的存在不意味着 provider 会理解它。

### 循环与持久化

[agent-loop.ts](https://github.com/badlogic/pi-mono/blob/ed8b3bcc194c8263ec8bec3f337053ae73866da1/packages/agent/src/agent-loop.ts) 的 `runLoop()` 管理模型调用、工具执行、steering/follow-up；`executeToolCalls()` 按配置顺序或并行执行，调用前有参数校验与 `beforeToolCall` 阻止执行的机会。`AbortSignal` 贯穿循环与调用。

[session-manager.ts](https://github.com/badlogic/pi-mono/blob/ed8b3bcc194c8263ec8bec3f337053ae73866da1/packages/coding-agent/src/core/session-manager.ts) 的存储使用带版本 header 的 JSONL。`SessionEntry` 除 message 外，还包括 model_change、compaction、branch_summary、custom、custom_message、context_edit 等；条目的 `id/parentId` 形成树。

`buildSessionProjection()` 沿所选路径并结合压缩与追加的 context edit 生成上下文。`CustomEntry` 明确不进入模型上下文；`CustomMessageEntry` 可以进入上下文。`forkFrom()` 的文件级分叉与文件内改变分支路径是两种操作。

[agent-session.ts](https://github.com/badlogic/pi-mono/blob/ed8b3bcc194c8263ec8bec3f337053ae73866da1/packages/coding-agent/src/core/agent-session.ts) 的 `_handleAgentEvent` 在 `message_end` 调用会话追加方法；不能据此声称其每个流式 token 都已持久化。

**已核验的模块分工**：`ai` 处理模型协议，`agent` 处理通用循环，`coding-agent/core/messages` 增加应用消息，`session-manager` 管理会话存储与投影。

## 3. OpenCode：同时观察 V1 的内容块和 V2 的事件投影

### V1 路径

[packages/schema/src/session-v1.ts](https://github.com/anomalyco/opencode/blob/0112a92c416f5ad833d96e7a8308441f0a875d94/packages/schema/src/session-v1.ts) 导出 V1 消息和内容块 schema；[packages/opencode/src/session/message-v2.ts](https://github.com/anomalyco/opencode/blob/0112a92c416f5ad833d96e7a8308441f0a875d94/packages/opencode/src/session/message-v2.ts) 的 `toModelMessagesEffect()` 将应用消息/parts 组织为 AI SDK UI 消息，再调用 `convertToModelMessages()`。

工具状态明确区分 pending/running/completed/error；text、reasoning、file、tool 等内容与模型消息角色是不同维度。其转换代码针对模型变化和 provider metadata 有具体分支，不能将应用消息原样发送给所有模型。

[session/sql.ts](https://github.com/anomalyco/opencode/blob/0112a92c416f5ad833d96e7a8308441f0a875d94/packages/core/src/session/sql.ts) 中 `MessageTable` 与 `PartTable` 分别存消息和内容块；这些可更新的消息表并非织台“历史只追加”契约的直接替代品。

### V2 路径

入口证据：[packages/server/src/handlers/session.ts](https://github.com/anomalyco/opencode/blob/0112a92c416f5ad833d96e7a8308441f0a875d94/packages/server/src/handlers/session.ts) 的 `session.prompt` 调用 `SessionV2`。这确认新 HTTP 路径实际接入 V2，不据此推断每种客户端都已切换。

[packages/schema/src/session-message.ts](https://github.com/anomalyco/opencode/blob/0112a92c416f5ad833d96e7a8308441f0a875d94/packages/schema/src/session-message.ts) 定义 `SessionMessage.Message` 联合：user、assistant、synthetic、shell、compaction、system、agent-switched、model-switched。assistant 的 content 是 text/reasoning/tool 联合，工具块包含状态。

[session/projector.ts](https://github.com/anomalyco/opencode/blob/0112a92c416f5ad833d96e7a8308441f0a875d94/packages/core/src/session/projector.ts) 消费 durable `SessionEvent`，借助 `SessionMessageUpdater` 更新 `SessionMessageTable`。该表有独立 `seq/type/data`；它与 V1 的 message/part 表同时存在。

[session/runner/to-llm-message.ts](https://github.com/anomalyco/opencode/blob/0112a92c416f5ad833d96e7a8308441f0a875d94/packages/core/src/session/runner/to-llm-message.ts) 的 `toLLMMessages()` 做明确转换：agent-switched/model-switched 不生成模型消息；assistant 工具块展开为调用和结果；provider metadata 按模型与错误状态决定是否复用。跨模型时 reasoning 文本可降为 text，是该项目的具体策略，不是通用协议要求。

[session/runner/llm.ts](https://github.com/anomalyco/opencode/blob/0112a92c416f5ad833d96e7a8308441f0a875d94/packages/core/src/session/runner/llm.ts) 使用 `@opencode-ai/llm`，显式组织一轮流、调用记录、工具执行、结果落盘与下一次模型请求。V2 此入口不是直接调用 AI SDK 的 V1 路径。文件仍列有未完成的恢复、取消收束等事项；不能将未完成注释当成已实现保证。

模型解析还通过 [runner/model.ts](https://github.com/anomalyco/opencode/blob/0112a92c416f5ad833d96e7a8308441f0a875d94/packages/core/src/session/runner/model.ts) 和 [aisdk.ts](https://github.com/anomalyco/opencode/blob/0112a92c416f5ad833d96e7a8308441f0a875d94/packages/core/src/aisdk.ts) 支持 `api.type === "aisdk"`。自有模型接口与 AI SDK 后端可以共存；无需为了应用类型独立就放弃 SDK。

**已核验的模块分工**：schema 定义会话内容，event 定义事实，projector/updater 生成消息投影，runner 组织执行，to-llm-message 生成模型输入。

## 4. Cline：显式 handler 和消息 codec，持久化仍有协议形状

[apps/vscode/src/core/api/index.ts](https://github.com/cline/cline/blob/8eee168b80127b0c94bad849323754b5864865e7/apps/vscode/src/core/api/index.ts) 明确标注其现为类型入口，`buildApiHandler` 已移到 `apps/vscode/src/sdk/sdk-api-handler.ts` 并通过 Cline SDK 调用推理。不能沿用旧版顶层 `src/api` 的目录介绍。

[providers/handler.ts](https://github.com/cline/cline/blob/8eee168b80127b0c94bad849323754b5864865e7/sdk/packages/llms/src/providers/handler.ts) 的 `ApiHandler` 提供 `getMessages()`、`createMessage()`、`getModel()` 与可选取消/用量接口；[factory-registry.ts](https://github.com/cline/cline/blob/8eee168b80127b0c94bad849323754b5864865e7/sdk/packages/llms/src/providers/factory-registry.ts) 用 Map 注册同步或异步工厂。调用者可以增加 handler，不必将所有实现写入固定枚举分支。

[providers/ai-sdk.ts](https://github.com/cline/cline/blob/8eee168b80127b0c94bad849323754b5864865e7/sdk/packages/llms/src/providers/ai-sdk.ts) 使用 AI SDK，`toAiSdkMessages()` 从 `AgentMessage[]` 构造模型输入，并根据能力处理 reasoning 和输入媒体。

[runtime/config/agent-message-codec.ts](https://github.com/cline/cline/blob/8eee168b80127b0c94bad849323754b5864865e7/sdk/packages/core/src/runtime/config/agent-message-codec.ts) 在存储消息和运行时消息之间转换：

- 存储侧 user 消息中的 `tool_result` 拆为运行时 `role:"tool"` 消息，反向保存时再转回 user。
- thinking、redacted_thinking、tool_use 转为 reasoning、tool-call 等运行时块，同时携带签名或不透明数据。
- `displayOnly` 消息不会进入运行时消息/模型上下文。
- 转换显式保持工具结果的稳定 ID；恢复时反复添加 ID 后缀会破坏压缩状态所用的源前缀 hash，代码对此有专门处理。

[messages-contract-v1.md](https://github.com/cline/cline/blob/8eee168b80127b0c94bad849323754b5864865e7/sdk/packages/core/docs/messages-contract-v1.md) 描述带 `version:1` 的 `<sessionId>.messages.json`，用于回放与导出。其落盘 shape 仍采用 user/assistant 和 Anthropic 风格内容块；hooks.jsonl 被定义为观测资料，不是回放所必需。

写入方 [session-data.ts](https://github.com/cline/cline/blob/8eee168b80127b0c94bad849323754b5864865e7/sdk/packages/core/src/services/session-data.ts) 的 `buildMessagesFilePayload()` 与 [local-runtime-host.ts](https://github.com/cline/cline/blob/8eee168b80127b0c94bad849323754b5864865e7/sdk/packages/core/src/runtime/host/local-runtime-host.ts) 是契约的实现依据；应与 codec 联合阅读，文档中的简表不是完整内容类型枚举。

[sqlite-session-store.ts](https://github.com/cline/cline/blob/8eee168b80127b0c94bad849323754b5864865e7/sdk/packages/core/src/services/storage/sqlite-session-store.ts) 的 SQLite 保存会话状态、关联和 messages_path 等索引资料，不能把“用了 SQLite”解读为“对话事实全存于只追加事件表”。完整 artifact 写入路径与不同宿主的持久化时机需分别看对应调用链。

[agents/agent-runtime.ts](https://github.com/cline/cline/blob/8eee168b80127b0c94bad849323754b5864865e7/sdk/packages/agents/src/agent-runtime.ts) 在模型流中累积工具参数，再统一 `parseToolInput()`；`executeToolCalls()` 支持顺序执行和相邻的并行组。被 steering 打断的模型流在重建可续接消息时排除工具块和 reasoning 块，避免续用不完整 JSON 或无签名推理；这不等于整个产品从未保存/显示过这些增量。织台应保留可查看的中断事实，再单独决定续接输入。

其分叉路径 [apps/cli/src/runtime/interactive/session-runtime.ts](https://github.com/cline/cline/blob/8eee168b80127b0c94bad849323754b5864865e7/apps/cli/src/runtime/interactive/session-runtime.ts) 的 `forkCurrentSession()` 以源消息作为 `initialMessages` 创建新会话；没有据此认定其与织台共享前缀事件的分支语义相同。

**已核验的模块分工**：`llms/providers` 管 handler、注册和 AI SDK 转换，`core/runtime/config` 管运行时 codec，`core/session` 管会话服务，`core/services/storage` 管存储设施。

## 5. Codex 与 AI SDK：各自提供不同层次的参考

### Codex

[model-provider-info/src/lib.rs](https://github.com/openai/codex/blob/a933dd77dbe101d7bd746ea3c7d1f8174eca4a05/codex-rs/model-provider-info/src/lib.rs#L97) 的 `WireApi` 只有 Responses，旧 chat 值会报错。可配置多个 provider/端点，不等于原生支持多种消息协议。

它至少区分三种结构：

- [ResponseItem](https://github.com/openai/codex/blob/a933dd77dbe101d7bd746ea3c7d1f8174eca4a05/codex-rs/protocol/src/models.rs#L1010)：模型上下文/输出项目，包括 message、reasoning、function call/output 等。
- [TurnItem](https://github.com/openai/codex/blob/a933dd77dbe101d7bd746ea3c7d1f8174eca4a05/codex-rs/protocol/src/items.rs#L45)：轮次中呈现的用户/助手消息、推理、计划和工具活动等。
- [RolloutItem](https://github.com/openai/codex/blob/a933dd77dbe101d7bd746ea3c7d1f8174eca4a05/codex-rs/history/src/lib.rs#L209)：持久化记录，除 response 外包括 session metadata、turn context、compaction、用量和事件。

[stream_events_utils.rs](https://github.com/openai/codex/blob/a933dd77dbe101d7bd746ea3c7d1f8174eca4a05/codex-rs/core/src/stream_events_utils.rs) 的 `handle_output_item_done()` 在生成工具执行任务前先保存调用；[session/turn.rs](https://github.com/openai/codex/blob/a933dd77dbe101d7bd746ea3c7d1f8174eca4a05/codex-rs/core/src/session/turn.rs) 消费流、等待工具收束、保存结果并决定是否继续请求。工具可以在响应整体结束前启动，前提是对应调用项目已完成；与“半截参数直接执行”是不同事情。

[rollout/recorder.rs](https://github.com/openai/codex/blob/a933dd77dbe101d7bd746ea3c7d1f8174eca4a05/codex-rs/rollout/src/recorder.rs) 管 JSONL 追加；[thread_manager.rs](https://github.com/openai/codex/blob/a933dd77dbe101d7bd746ea3c7d1f8174eca4a05/codex-rs/core/src/thread_manager.rs) 管恢复和分叉，`ForkPersistence` 区分 copied/referenced。它说明模型记录、轮次状态、存储 IO 可以分工；不意味着织台应照搬 Responses 形状或 JSONL。

### Vercel AI SDK

[provider-registry.ts](https://github.com/vercel/ai/blob/45e1fbc3ea10d22f852e12b1c1851e289c85e835/packages/ai/src/registry/provider-registry.ts) 注册 provider 并解析模型；[language-model-v4.ts](https://github.com/vercel/ai/blob/45e1fbc3ea10d22f852e12b1c1851e289c85e835/packages/provider/src/language-model/v4/language-model-v4.ts) 定义模型调用与流的接口。这是本次 main 快照的接口版本，不是本项目已选的依赖版本。

[model-message.ts](https://github.com/vercel/ai/blob/45e1fbc3ea10d22f852e12b1c1851e289c85e835/packages/provider-utils/src/types/model-message.ts) 和 [content-part.ts](https://github.com/vercel/ai/blob/45e1fbc3ea10d22f852e12b1c1851e289c85e835/packages/provider-utils/src/types/content-part.ts) 有模型消息、标准内容块、providerOptions 以及 custom part。

[convert-to-model-messages.ts](https://github.com/vercel/ai/blob/45e1fbc3ea10d22f852e12b1c1851e289c85e835/packages/ai/src/ui/convert-to-model-messages.ts) 区分 UI data part 与模型内容，并允许 `convertDataPart`。这提供转换机制，但不替应用定义每种自定义内容是否应发送、如何持久化、如何授权。

## 6. 对织台的设计建议

以下为结合现有历史内核的判断，不是上述项目共同遵守的标准。

| 借鉴来源 | 适合织台的做法 | 保持织台自己的边界 |
| --- | --- | --- |
| pi | 可扩展应用消息，整理上下文与转换协议分开 | 继续使用 SQLite 事件和分支语义，不迁移为 pi 会话文件 |
| OpenCode | 明确区分内容类型；事件投影出 transcript；单独的模型转换模块 | 织台 transcript 采用同级平铺条目；消息投影可更新，事实只追加 |
| Cline | handler 工厂、明确 codec、带版本的持久化契约 | 不把所有工具结果永久归为用户消息；运行时与落盘尽量共享织台类型 |
| Codex | 工具调用先记录；模型项目、执行状态与存储记录分工 | 多协议与资源授权由织台定义，不采用 Responses 作为唯一领域模型 |
| AI SDK | 复用 provider 调用、流解码和协议适配 | SDK 类型和版本变化被限制在模型模块 |

### 6.1 Transcript 的平铺结构（已确认）

基础条目为 `message`（用户消息）、`thinking`（模型思考）、`toolcall`（模型工具调用）、`text`（模型正文），后三种均属于模型输出。条目按发生顺序同级平铺，不设模型消息父容器：

```text
message → thinking → toolcall → thinking → text
```

工具执行结果与错误由能力层管理，通过调用身份关联 `toolcall`，不作为第五种基础 transcript 类型。界面可查询执行状态与结果，自行组织展示；当前默认聚合折叠连续思考和工具过程，完整显示模型正文。UI 分组不决定能力数据结构或持久化格式。

条目通过执行轮次、模型请求、调用身份和必要的协议项目身份关联。适配层据此组装 Anthropic 等协议需要的助手消息与内容块；协议分组不反向规定织台的存储层级。不能只根据条目相邻就认定它们属于同一个响应。

流式增量更新对应条目的投影，底层事实继续追加；平铺不要求每个 token 成为一个 transcript 条目。条目载荷仍可包含附件或结构化工具结果，具体类型字段待定。

现有资源绑定、规则变化、分支等事件继续属于历史；需要让模型知道时，由上下文构建器生成带来源的内容。不能把每条系统事件强行伪装成用户发言，也不必把全部历史事件变成 transcript 消息。

### 6.2 类型扩展必须说明四件事

新增类型需要有稳定标识和载荷版本，并明确：如何校验/解码、如何保存、如何显示、如何进入模型上下文。首批可用静态类型联合与处理器表实现，不需要先建设动态插件平台。

未知的 transcript 条目类型可保留原始载荷并显示未支持状态；需要影响模型上下文却无法转换的类型应明确失败或要求选定转换策略。纯展示记录可以显式排除。不能用“未知类型一律丢弃”兼容未来数据。

对未知授权/执行事件仍按现有内核的安全语义处理；展示层能容忍未知内容，不代表执行层可以忽略未知事实。

必要 provider 数据按协议和作用域封装，不能无限制把请求或响应整包放入 metadata。模型切换策略需单独确定，不能默认复制其他项目的 reasoning→text 降级行为。

### 6.3 协议扩展的边界

协议适配器接收准备好的上下文、工具目录与调用参数，返回统一的流事件：内容开始/增量/结束、调用、用量、正常完成、失败。它不写任务数据库、不执行工具、不修改资源绑定。

模型模块内部优先复用 AI SDK；协议差异、provider 配置和必要续接数据在此处理。新增支持 Gemini 等协议时，应主要增加适配与能力映射；确有新内容能力时通过 transcript 扩展点增加类型。

“新增协议无需改任何文件”不是目标；“新增协议不迫使重写历史、授权和 UI 主循环”才是可检查的边界。

### 6.4 持久化与执行循环

保留现有 SQLite 只追加历史与正文对象存储。transcript 是这些事件组织出的对话视图，可缓存或导出，但不另建一份独立维护的会话真值。

流式增量、内容完成、模型请求结束与工具执行结果分开表达。哪些增量已落盘就能恢复，未落盘的不能承诺恢复；部分内容可以显示，不自动当成完整模型消息续接。

工具调度存在两种合理策略：整个模型响应正常结束后执行，或单个调用完整并持久化后立即执行。Codex 和 OpenCode 的相关路径证明后者是实际方案；织台首批可采用前者降低中断和并发复杂度，但这仍是待拍板的执行策略，不是协议强制规则。

恢复时先读取事实并判定完成状态；不因恢复进程启动就重新执行工具。运行时仍须遵守已确定的轮次冻结授权，不能照搬其他项目在采样之间即时修改工具可见性的行为。

## 7. 建议的代码组织

以下为职责示意，实施时按体量合并文件，不预先创建空目录或通用插件框架：

```text
src/transcript/
  schema.ts           同级条目类型、关联与扩展载荷的版本化契约
  projection.ts       从历史事实组织有序对话记录

src/model/
  contract.ts         模型请求、能力、统一流事件
  registry.ts         协议适配器注册与配置解析
  adapters/           AI SDK 调用与各协议差异

src/runtime/
  context.ts          选取历史、规则、资源事件，构造本次输入
  execution.ts        一轮中的多次模型请求、取消与续轮
  tools.ts            参数校验、授权、调用与操作关联、结果落盘

src/history/          继续拥有事件、事务、分支与重建
src/renderer/         消费 transcript 和操作投影，不导入 provider SDK
```

调用路径建议：用户输入先入历史 → context 按轮次快照构造输入 → model 输出统一流事件 → runtime 转成织台事实 → history 持久化 → transcript 投影供展示与后续上下文使用。工具请求由 runtime 授权并执行，结果落盘后再构造下一次模型请求。

核心依赖约束：transcript schema 不依赖 provider SDK；model 不依赖 SQLite/授权实现；runtime 组合这几者；renderer 只依赖公开 DTO。类型文件可独立，但无需一开始拆成多个 npm 包。

## 8. 后续契约与调查限制

调查为后续接口设计提供依据；实际顺序由 [模型接入计划](../plans/todo-2026-10-01-model-protocol-storage.md) 管理，先完成 UI 壳子与提供商配置，再收敛以下契约：

1. 平铺 Transcript 的条目类型字段、关联信息、扩展封套和 provider 数据位置。
2. 统一模型流事件、工具结果配对、正常结束与中断含义。
3. 事件载荷版本、流式落盘时机、旧记录读取和分支续接。
4. 工具启动时机与并发、取消后的继续策略、跨模型转换策略。

首批协议范围与凭据保存方式已在 [决策文档](decisions.md) 确认，内容保留策略仍待定。源码调查不代表调用、存储迁移、第三方代码引入或依赖安装已完成。

调查限制：没有完整核验各项目所有 UI/CLI 的路由、所有 fork/compaction 情形及所有 provider 兼容性；OpenCode V2 的未完成项不当作已交付能力；Cline 的持久化契约文档需和实际 writer/codec 联合解释，不能单凭文件名推断；所有性能、崩溃恢复和外部服务行为均未做运行验证。
