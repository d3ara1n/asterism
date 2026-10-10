# 模型接入与 Transcript 源码调研

> 调研日期：2026-10-01。固定源码快照的静态调查，未运行这些项目的测试，也不代表全部发布版本的行为。第 1—5 节为源码事实，第 6 节列出工坊采用的边界；当前实现契约见 `conversation-core.md`。
>
> 已确认方向：Vercel AI SDK 作为模型适配基线，上层能扩展更多协议；工坊拥有可扩展的对话记录（transcript），组织用户消息、助手消息、思考与工具过程。实施任务见 [模型协议与存储立案](../plans/todo-2026-10-01-model-protocol-storage.md)。

## 1. 范围与源码版本

| 项目 | 固定提交 | 本次重点 |
| --- | --- | --- |
| pi | `badlogic/pi-mono@ed8b3bcc194c8263ec8bec3f337053ae73866da1` | 协议适配、可扩展消息、上下文转换、树状会话记录 |
| OpenCode | `anomalyco/opencode@0112a92c416f5ad833d96e7a8308441f0a875d94` | V1/V2 会话结构、内容块、事件投影、模型循环 |
| Cline | `cline/cline@8eee168b80127b0c94bad849323754b5864865e7` | 新版 SDK 的消息转换、provider handler、持久化契约 |
| Codex | `openai/codex@a933dd77dbe101d7bd746ea3c7d1f8174eca4a05` | 模型项目/轮次项目/持久化记录分工，工具执行与恢复 |
| Vercel AI SDK | `vercel/ai@45e1fbc3ea10d22f852e12b1c1851e289c85e835` | 协议接口、provider 注册、应用消息到模型消息的转换 |

这里调查的是源码快照，不将 upstream main 中的接口版本等同于当前 npm 稳定版；工坊安装依赖前仍需核验版本。pi 源码来自 `badlogic/pi-mono`，不假定与本机 `@earendil-works/pi-coding-agent` 发行完全相同。

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

[session/sql.ts](https://github.com/anomalyco/opencode/blob/0112a92c416f5ad833d96e7a8308441f0a875d94/packages/core/src/session/sql.ts) 中 `MessageTable` 与 `PartTable` 分别存消息和内容块；这些可更新的消息表并非工坊“历史只追加”契约的直接替代品。

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

[agents/agent-runtime.ts](https://github.com/cline/cline/blob/8eee168b80127b0c94bad849323754b5864865e7/sdk/packages/agents/src/agent-runtime.ts) 在模型流中累积工具参数，再统一 `parseToolInput()`；`executeToolCalls()` 支持顺序执行和相邻的并行组。被 steering 打断的模型流在重建可续接消息时排除工具块和 reasoning 块，避免续用不完整 JSON 或无签名推理；这不等于整个产品从未保存/显示过这些增量。工坊应保留可查看的中断事实，再单独决定续接输入。

其分叉路径 [apps/cli/src/runtime/interactive/session-runtime.ts](https://github.com/cline/cline/blob/8eee168b80127b0c94bad849323754b5864865e7/apps/cli/src/runtime/interactive/session-runtime.ts) 的 `forkCurrentSession()` 以源消息作为 `initialMessages` 创建新会话；没有据此认定其与工坊共享前缀事件的分支语义相同。

**已核验的模块分工**：`llms/providers` 管 handler、注册和 AI SDK 转换，`core/runtime/config` 管运行时 codec，`core/session` 管会话服务，`core/services/storage` 管存储设施。

## 5. Codex 与 AI SDK：各自提供不同层次的参考

### Codex

[model-provider-info/src/lib.rs](https://github.com/openai/codex/blob/a933dd77dbe101d7bd746ea3c7d1f8174eca4a05/codex-rs/model-provider-info/src/lib.rs#L97) 的 `WireApi` 只有 Responses，旧 chat 值会报错。可配置多个 provider/端点，不等于原生支持多种消息协议。

它至少区分三种结构：

- [ResponseItem](https://github.com/openai/codex/blob/a933dd77dbe101d7bd746ea3c7d1f8174eca4a05/codex-rs/protocol/src/models.rs#L1010)：模型上下文/输出项目，包括 message、reasoning、function call/output 等。
- [TurnItem](https://github.com/openai/codex/blob/a933dd77dbe101d7bd746ea3c7d1f8174eca4a05/codex-rs/protocol/src/items.rs#L45)：轮次中呈现的用户/助手消息、推理、计划和工具活动等。
- [RolloutItem](https://github.com/openai/codex/blob/a933dd77dbe101d7bd746ea3c7d1f8174eca4a05/codex-rs/history/src/lib.rs#L209)：持久化记录，除 response 外包括 session metadata、turn context、compaction、用量和事件。

[stream_events_utils.rs](https://github.com/openai/codex/blob/a933dd77dbe101d7bd746ea3c7d1f8174eca4a05/codex-rs/core/src/stream_events_utils.rs) 的 `handle_output_item_done()` 在生成工具执行任务前先保存调用；[session/turn.rs](https://github.com/openai/codex/blob/a933dd77dbe101d7bd746ea3c7d1f8174eca4a05/codex-rs/core/src/session/turn.rs) 消费流、等待工具收束、保存结果并决定是否继续请求。工具可以在响应整体结束前启动，前提是对应调用项目已完成；与“半截参数直接执行”是不同事情。

[rollout/recorder.rs](https://github.com/openai/codex/blob/a933dd77dbe101d7bd746ea3c7d1f8174eca4a05/codex-rs/rollout/src/recorder.rs) 管 JSONL 追加；[thread_manager.rs](https://github.com/openai/codex/blob/a933dd77dbe101d7bd746ea3c7d1f8174eca4a05/codex-rs/core/src/thread_manager.rs) 管恢复和分叉，`ForkPersistence` 区分 copied/referenced。它说明模型记录、轮次状态、存储 IO 可以分工；不意味着工坊应照搬 Responses 形状或 JSONL。

### Vercel AI SDK

[provider-registry.ts](https://github.com/vercel/ai/blob/45e1fbc3ea10d22f852e12b1c1851e289c85e835/packages/ai/src/registry/provider-registry.ts) 注册 provider 并解析模型；[language-model-v4.ts](https://github.com/vercel/ai/blob/45e1fbc3ea10d22f852e12b1c1851e289c85e835/packages/provider/src/language-model/v4/language-model-v4.ts) 定义模型调用与流的接口。这是本次 main 快照的接口版本，不是本项目已选的依赖版本。

[model-message.ts](https://github.com/vercel/ai/blob/45e1fbc3ea10d22f852e12b1c1851e289c85e835/packages/provider-utils/src/types/model-message.ts) 和 [content-part.ts](https://github.com/vercel/ai/blob/45e1fbc3ea10d22f852e12b1c1851e289c85e835/packages/provider-utils/src/types/content-part.ts) 有模型消息、标准内容块、providerOptions 以及 custom part。

[convert-to-model-messages.ts](https://github.com/vercel/ai/blob/45e1fbc3ea10d22f852e12b1c1851e289c85e835/packages/ai/src/ui/convert-to-model-messages.ts) 区分 UI data part 与模型内容，并允许 `convertDataPart`。这提供转换机制，但不替应用定义每种自定义内容是否应发送、如何持久化、如何授权。

## 6. 工坊采用的边界

源码事实保留在前五节，工坊最终契约以 [会话与单代理能力](conversation-core.md)、[运行时](runtime.md) 和 [决策](decisions.md) 为准。

- 借鉴 pi 的协议适配、循环与会话管理分层；一次响应对应一个模型节点，节点树支持历史查看与分支。
- 借鉴事件投影方式：流片段、工具结果和终态只追加，节点状态可重建。
- 工具调用与结果聚合在节点内部；模型与 GUI 独立投影，不照搬 TUI 渲染结构。
- AI SDK 负责请求和协议解码，工坊负责轮次、冻结授权、工具批次与持久化。
- SQLite 与对象存储继续拥有任务历史，不引入第三方会话文件作为另一份真值。
- provider 不透明数据按白名单、作用域和适配版本保存；不静默将不兼容思考降级为正文。

## 7. 调查限制

固定源码调查没有完整核验所有 UI/CLI 路由、fork/compaction 情形及 provider 兼容性。OpenCode V2 未完成项不当作已交付能力；Cline 持久化文档需和实际 writer/codec 联合解释。前五节的源码调查不代表真实端点或第三方项目性能、崩溃恢复已经运行验证。工坊自身实现与测试状态见 [模型接入计划](../plans/todo-2026-10-01-model-protocol-storage.md)。
