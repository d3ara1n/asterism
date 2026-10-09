# 会话与代理能力契约

本文描述能力层契约。会话树结构、投影与回溯语义见 [会话树、历史与回溯](timeline.md)；对象与资源见 [对象模型](object-model.md)。GUI 消费这些接口，组件不进入存储契约。

## 节点数据

| 节点 | 数据 |
| --- | --- |
| message | 目标 agent_id、用户正文；首批仅文本 |
| thinking / text | agent_id、response_id、request_parent_id、序号、正文、complete、续接资料与可空终态元数据 |
| toolcall | 同上请求身份与元数据，加本地/provider 调用 ID、工具名、参数与结局 |
| event | 类型与小载荷；大内容存 `objects/<hash>` 后引用 |
| notice | 来源对象、级别、类型、消息 |

block 通过 response_id 关联，response 由消费者投影，不设独立 response_end 节点。每个块携带 request_parent_id 和请求计算结果（adapter、模型表达式 `<providerId>/<modelId>[:<thinking>]`、协议作用域），以及可空的 usage、finishReason、rawFinishReason、providerResponseId。终态仅归属响应中序号最大的实际块，不能复制到各块；数据库通过唯一约束阻止重复计量。系统提示词、角色正文、工具目录、模型参数和完整请求不持久化。

续接资料保存为带适配版本的块级不透明字段：保留 Anthropic signature/redactedData，以及 OpenAI itemId/reasoningEncryptedContent/phase 白名单。不保存原始 HTTP、凭据、响应头或未筛选的 provider metadata。

## 写入时机

- 输入先于执行持久化。
- 流增量在运行时内存中按块累积；块完成时追加节点。取消、网络中断或请求失败时，已收到的部分以 `complete=false` 追加。
- 迟到终态以独立的只追加元数据记录绑定到实际块，读取时合并；不更新原始块、父指针或游标。收到终态但块不完整时仍保留报告的计量；没有终态时不补造计量。
- toolcall 执行期间不落库；取得结局时调用与结果作为一个节点追加。用户打断记为 cancelled。
- 请求在产生任何块之前失败（鉴权、限流、超时、请求准备失败），代理发出错误级 notice。
- 服务端结束却没有任何内容块时，发出 empty_response 诊断 notice，携带该异常响应的来源和终态资料，不建立伪造块。
- 通知只在保存后发出，消费方重新查询恢复丢失通知。进程崩溃不做兜底与自动重放。

## 工具结局

工具契约统一 args schema，后端实现分别声明 target/result schema、读写副作用、顺序/并行策略与执行器。选定实现后，结局携带该实现的 ID 与版本。结局为：

- succeeded：保存当次交给模型的 `model` 内容和用于重建视图的 `data`。
- rejected：工具策略、参数或授权拒绝。
- failed：已知失败。
- cancelled：已取消，包括用户打断。
- partial：已知部分结果及剩余说明。
- unknown：写操作失败且无法确认影响，要求检查资源后再决定后续操作。

协议需要错误布尔值时由适配层映射。结果形态按工具类型固定，不按长度分派内联或引用。

`data` 通过实现的 result schema 校验；`model` 由实现的可选 `toModel` 生成，默认等于 data。两者只在执行时生成并随节点保存。UI 按实现 ID/版本查找组件，使用保存的数据渲染；组件缺失、版本不符或数据校验失败时回退原始数据。

## 执行循环

模型响应正常结束 → 参数与 agent 工具策略校验 → 显式 resource_id 与本轮有效链接校验 → 执行 → 结局节点保存 → 整批收束 → 下一请求。输出截断与不完整参数不启动工具。并行完成顺序不影响模型输入顺序，投影按序号排列；含顺序工具的批次按原顺序执行。

模型协议中的 tools 是 Weft 固定操作入口：`resource_list`、`resource_inspect`、`resource_call(resource_id, tool, target?, args)`。核心工具与资源平级定义，通过后端实现声明支持关系。链接资源激活匹配工具，agent 的 tools/excludeTools 等外部策略再决定是否允许使用；资源实例不持有工具列表或白名单。Weft 入口不受名单约束，也不开放插件注册。请求能力视图从统一目录选择实现并应用链接状态和外部策略；批次按实际实现的副作用和调度策略执行。args、target、result schema 在资源链接通知或 inspect 中提供，不进入顶层 tools。当前原生资源工具为笔记 read 与目录 list/read；编辑、MCP 与代理间通信待接入。

一个执行轮次内可有多次模型请求。轮次请求上限采用 agent.maxTurns，空值为 32；timeout 空值为 600 秒，取消协作式中止，不承诺撤销副作用。maxCost 尚无价格契约，设置后明确拒绝启动。

## 环境

代理控制器在每次请求前一起取得消息路径、代理配置与资源授权，再组装系统提示词：当前代码的 harness、当前 agent 配置，以及本次已链接目录资源中的 AGENTS.md（读取不走 resource_call，不缓存）。在途请求及其工具批次保持这份环境；设置与资源变化在下一次请求反映，由此产生的缓存失效属于用户预期。会话树仍实时记录事件，模型投影把请求期间的事件安排在该响应与工具结果之后。代理选择（agent 配置 ID、模型 ID、思考等级、修订号）按代理对象保存，可修改，独立于会话树。所选身份失效时明确失败。

## 模型适配

三协议使用已安装 AI SDK：OpenAI Responses、OpenAI Chat Completions、Anthropic Messages。工具定义不提供 SDK execute；关闭隐式重试与流重试。带凭据的远程端点要求 HTTPS，无鉴权模式去除认证头，禁止自动重定向。每个 SDK 调用只进行一个模型步骤，由织台执行后续循环。OpenAI Responses 使用 store:false 并请求 encrypted reasoning。

直接续接要求 provider、协议、端点、模型标识和适配版本兼容；不兼容时在提交前明确失败。图片与服务端工具暂不支持。

## 前端能力接口

`window.weft.session` 提供 `execute` 与 `onChanged`，IPC 版本为 5。资源与布局命令也属于此会话入口。应用通道只读取工作区身份和会话列表，不持有已打开会话的正文。

| 命令 | 行为 |
| --- | --- |
| `start` | 显式 agent 配置、模型和 thinking；原子保存 Session、首个代理、首条输入并开始执行 |
| `submit` | 在游标处向指定代理追加消息并执行；运行中返回 conflict |
| `continue` | 从当前合法位置继续指定代理 |
| `configure` | 修改代理选择，不追加历史；下一请求生效 |
| `read` | 指定跟随游标或历史位置；同次读取返回会话树、实际查看节点、代理选择、工作台投影和当前进度 |
| `select` | 会话 settled 时选择位置；记录原位置、请求位置和吸附后的实际位置，与游标更新同事务提交，不追加模型可见节点 |
| `cancel` | 请求停止；终态通过通知或查询观察 |
| `note.create` / `directory.add` / `object.remove` / `link.set` | 变更指定会话的资源与关系，事务提交后通知 |
| `view.set` / `viewport.set` | 保存当前布局，不修改历史；历史查看期间也可调整 |

命令返回 `accepted` 与会话身份，不附带展示数据；`read` 返回 `view`。start/submit 的 submissionId 为 UUID，相同身份与内容重复提交只返回已有会话身份，内容不同返回 conflict。

会话视图模块拥有查看位置：`live` 跟随执行游标，`history` 固定到节点或会话起点。组件只表达查看、返回当前、分叉和操作意图，不编排查询或传递当前历史位置。工作台与对话采用同一份读取结果的实际查看节点；切换期间保留原位置的完整视图并标记加载，查询成功后一起切换。命令受理不会覆盖展示，布局保存后继续查询原查看位置。历史查看限制界面中的领域变更，不代替运行时资源授权。

命令已受理但新投影未取得时，视图仍未就绪，不允许基于旧配置或链接继续构造领域命令。读取失败时放弃未发布的导航目标，保留原画面并标记错误；重新读取成功前保持操作门禁。会话错误由会话模块持有，工作台提供独立于代理卡片的提示，模态操作在对应对话框内显示原因；后台读取不会自动清除操作错误。

`session.changed` 携带会话身份与持久视图修订 `revision`，节点、终态元数据、选择或布局变化后通知重读。`seq` 仍只表示节点追加序号。`session.progress` 独立发布完整的当前内存进度，携带单调 `version`、所依赖的持久 `revision`、运行代理与 live 块，不触发每个增量的全历史查询。进度先于对应持久视图到达时，消费者保留已有块并等待该视图；初次打开或重连通过完整读取恢复两者。两个修订只在任务进程生命周期内用于同步，不写入历史，任务进程退出后仍须重启应用。

块的展示身份使用 `responseId + ordinal`，在内存与持久阶段保持一致；保存后以持久数据接替，不创建另一套块组件。历史节点 ID 继续用于路径、审计和分叉。画布订阅持久视图，对话另行订阅进度；展开状态不因落库而重置。

## 验证边界

单元与契约测试使用临时 SQLite、合成模型流与 AI SDK mock，不请求真实 provider。真实端点、Electron GUI 和跨平台行为由用户验收。
