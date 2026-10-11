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
- 流增量由代理执行侧在内存中按块累积，作为临时进度提供给 UI；块成型后提交给 Session，由 Session 记录到时间轴。一个 thinking 块可以先成型，后续 text 流仍在继续；块成型不等于资源 settled。取消、网络中断或请求失败时，代理将已收到的部分整理为 `complete=false` 记录提交。
- 迟到终态以独立的只追加元数据记录绑定到实际块，读取时合并；不更新原始块、父指针或游标。收到终态但块不完整时仍保留报告的计量；没有终态时不补造计量。
- toolcall 执行期间不落库，合法产出通过 session.progress 更新；取得结局时调用与结果作为一个节点追加。确认取消记为 cancelled，无法确认写入影响的中止记为 unknown。
- 请求在产生任何块之前失败（鉴权、限流、超时、请求准备失败），代理发出错误级 notice。
- 服务端结束却没有任何内容块时，发出 empty_response 诊断 notice，携带该异常响应的来源和终态资料，不建立伪造块。
- 通知只在保存后发出，消费方重新查询恢复丢失通知。进程崩溃不做兜底与自动重放。

Session 是时间轴的单一写入者。成型记录、终态元数据、对象与链接事件均经同步事务提交；取当前父节点、追加记录与更新游标不可交错，事务内不等待模型、文件系统或 IPC。资源控制器只持有自己的活动与流状态，通过会话提交接口写入，不直接操作会话树或回溯游标；续接位置由 Session 按全会话收束状态管理。

## 工具结局

工具契约统一 description、guidelines 与 args schema，后端实现分别声明含描述的 target/result schema、读写副作用、顺序/并行策略与执行器，不重复工具使用指导。选定实现后，结局携带该实现的稳定 ID。结局为：

- succeeded：已知成功。
- rejected：工具策略、参数或授权拒绝。
- failed：已知失败。
- cancelled：已取消，包括用户打断。
- partial：已知部分结果及剩余说明。
- unknown：写操作失败且无法确认影响，要求检查资源后再决定后续操作。

协议需要错误布尔值时由适配层映射。结果形态按工具类型固定，不按长度分派内联或引用。

所有结局都保存 `data` 与 `model`。过程态为 `{kind: "running", data}`，与终结态共用实现的 result schema；`publish(data)` 以完整产出替换最近的合法快照，不合契约的数据不能覆盖有效产出。无产出用 null 表示。失败、取消、未知等结局省略 data 时采用最近产出，显式 null 清空。工具终结后发布回调失效。

`model` 只在终结时由可选 `toModel(data)` 投影；成功默认等于 data，其余结局还包装 kind、错误或说明。模型适配器只消费保存的 model，不能将 GUI 数据、资源标题或执行时间当作错误对象一起发送。结局同时保存实际实现 ID、请求边界内的资源身份/类型/名称、开始与结束时间。UI 的 headerRenderer/bodyRenderer 接收同一份调用和结果，分别可选；历史按实现身份选择视图并经其 schema 解码，缺失或数据不兼容时使用默认视图。

## 执行循环

模型响应正常结束 → 参数与 agent 工具策略校验 → 显式 resource_id 与本轮有效链接校验 → 执行 → 结局节点保存 → 整批收束 → 下一请求。输出截断与不完整参数不启动工具。并行完成顺序不影响模型输入顺序，投影按序号排列；含顺序工具的批次按原顺序执行。

模型协议中的 tools 是 Atelier 固定操作入口：`resource_list`、`resource_inspect`、`resource_call(resource_id, tool, target?, args)`。两层工具使用同一 ToolContract 与定义投影；一级入口的 guidelines 合入协议说明，二级工具的 description、guidelines、args 及实现的 target/result schema 在资源链接通知或 inspect 中提供，不进入顶层 tools。核心工具与资源平级定义，通过后端实现声明支持关系。链接资源激活匹配工具，agent 的 tools/excludeTools 等外部策略再决定是否允许使用；资源实例不持有工具列表或白名单。宿主入口不受名单约束，也不开放插件注册。请求能力视图从统一目录选择实现并应用链接状态和外部策略；批次按实际实现的副作用和调度策略执行。当前原生资源工具包括目录 list 与文件、笔记的 read/edit/write；MCP 与代理间通信待接入。

一个执行轮次内可有多次模型请求。轮次请求上限采用 agent.maxTurns，空值为 32；timeout 空值为 600 秒，取消协作式中止，不承诺撤销副作用。maxCost 仅有配置字段与目录投影，当前代理控制器及模型循环尚未消费，不能视为生效的费用限制；价格契约与未支持预算的执行前校验见 [模型接入计划](../plans/todo-2026-10-01-model-protocol-storage.md)。

多次请求的循环由内置 Agent 控制器推动。通用 `models.run` 只执行一次模型请求及该响应的工具批次，显式接收投影输入，交付块、终态、诊断与临时进度，不自行保存对话或发起下一请求。Agent 将成型输出经会话提交到时间轴，随后重新投影下一次输入。轮数、缓存命中预期和停止规则由 Agent 提供；命名等一次性补全消费者直接使用 `models.stream`。

## 环境

代理控制器在每次请求前一起取得消息路径、代理配置与资源授权，再组装系统提示词：当前代码的 harness、当前 agent 配置，以及本次已链接目录资源中的 AGENTS.md（读取不走 resource_call，不缓存）。在途请求及其工具批次保持这份环境；设置与资源变化在下一次请求反映，由此产生的缓存失效属于用户预期。会话树仍实时记录事件，模型投影把请求期间的事件安排在该响应与工具结果之后。代理选择（agent 配置 ID、模型 ID、思考等级、修订号）按代理对象保存，可修改，独立于会话树。所选身份失效时明确失败。

context 唯一真值在时间轴。Agent 可以持有选择、计数、取消与活动状态，但不保存另一份 context；消息投影只服务当次调用。后续上下文裁剪、压缩和选取机制也须以时间轴事实为依据，不直接改写既有事件或在 Agent 内维持独立历史。

## 模型适配

三协议使用已安装 AI SDK：OpenAI Responses、OpenAI Chat Completions、Anthropic Messages。工具定义不提供 SDK execute；关闭隐式重试与流重试。带凭据的远程端点要求 HTTPS，无鉴权模式去除认证头，禁止自动重定向。每个 SDK 调用只进行一个模型步骤，由工坊执行后续循环。OpenAI Responses 使用 store:false 并请求 encrypted reasoning。

直接续接要求 provider、协议、端点、模型标识和适配版本兼容；不兼容时在提交前明确失败。图片与服务端工具暂不支持。

Responses 模型声明的思考能力显式传给 SDK，不依赖 SDK 的 OpenAI 模型名称识别；声明思考能力时，开启、关闭与等级参数均传到请求中。模型声明思考能力且未关闭思考时，显式请求可见摘要，包括采用默认思考等级的情况；加密推理资料独立用于续接。代理页面只展示含可见正文的思考块，空块仍保留在历史与模型投影中，不显示空折叠项。

DeepSeek 官方端点 `api.deepseek.com` 的 Responses 返回 `response.reasoning_text.delta`，不生成思考摘要。适配层通过 SDK 的原始事件接口读取已知正文增量，复用原有思考块身份、即时进度与保存流程；原始帧不持久化或写入日志。DeepSeek 不支持 reasoning 输入的 summary/encrypted_content，声明将纯文本 content 合入相邻 assistant 正文，因此模型投影将保存的思考作为 assistant 文本发送，不携带该块的 OpenAI 续接字段；工坊历史仍区分 thinking 与 text。系统指令保留 system 身份，避免 DeepSeek 把 developer 当作 user。协议依据见 [DeepSeek Responses 指南](https://api-docs.deepseek.com/guides/responses_api/) 与 [接口参考](https://api-docs.deepseek.com/api/create-response/)。

可组合的模型兼容包方向已确认，通用机制尚未实现。后续由提供商默认组合和模型覆盖统一控制编码、解码与续接，将上述端点专用行为迁入兼容模块，支持用户为自定义与中转端点显式选择；实施与待定契约见 [模型兼容计划](../plans/todo-2026-10-10-model-compatibility.md)。

## 前端能力接口

`window.host.session` 提供 `execute` 与 `onChanged`，IPC 版本为 9。资源与布局命令也属于此会话入口。应用通道只读取工作区身份和会话列表，不持有已打开会话的正文。

| 命令 | 行为 |
| --- | --- |
| `start` | 显式 agent 配置、模型和 thinking；原子保存 Session、首个代理、首条输入并开始执行 |
| `resource.command` | 路由到对象所属资源控制器；代理命令为 `submit`（追加消息并执行，仅本代理运行中返回 conflict）、`continue`、`configure`（修改资源私有选择，下一请求生效）、`cancel`（只停止该代理） |
| `resource.create` | 由资源模块校验 input 并创建对象：代理需显式选择，笔记可空正文，目录须为存在的绝对路径 |
| `read` | 指定跟随游标或历史位置；同次读取返回会话树、实际查看节点、代理选择、工作台投影和当前进度 |
| `select` | 会话所有被捕获的资源均 settled 时选择位置；记录原位置、请求位置和吸附后的实际位置，与游标更新同事务提交，不追加模型可见节点 |
| `object.remove` | 对象 settled 后移除，并解除全部入向、出向链接；未收束时返回 conflict，不隐式取消活动 |
| `link.set` | 变更指定会话的资源关系，事务提交后通知 |
| `view.set` / `viewport.set` | 保存当前布局，不修改历史；历史查看期间也可调整 |

命令返回 `accepted` 与会话身份，不附带展示数据；`read` 返回 `view`。start/submit 的 submissionId 为 UUID，相同身份与内容重复提交只返回已有会话身份，内容不同返回 conflict。

`resource.create` 的受理回执表示对象创建事件、资源私有状态与初始布局已提交；前端随后读取新投影以更新画面。后端的串行事务保证时间轴写入顺序，前端的投影同步保证后续意图使用已确认的展示状态，两者职责不同。

会话视图模块拥有查看位置：`live` 跟随执行游标，`history` 固定到节点或会话起点。组件只表达查看、返回当前、分叉和操作意图，不编排查询或传递当前历史位置。工作台与对话采用同一份读取结果的实际查看节点；切换期间保留原位置的完整视图并标记加载，查询成功后一起切换。命令受理不会覆盖展示，布局保存后继续查询原查看位置。历史查看限制界面中的领域变更，不代替运行时资源授权。

命令已受理但新投影未取得时，视图仍未就绪，不允许基于旧配置或链接继续构造领域命令。就绪视图上连续入队的操作意图（例如一次拖入多个目录）依次等待前项投影同步后再受理，并重新检查执行时的查看位置；同步失败时拒绝后项并显示原因。读取失败时放弃未发布的导航目标，保留原画面并标记错误；重新读取成功前保持操作门禁。会话错误由会话模块持有，工作台提供独立于代理卡片的提示，模态操作在对应对话框内显示原因；后台读取不会自动清除操作错误。

`session.changed` 携带会话身份与持久视图修订 `revision`，节点、终态元数据、选择或布局变化后通知重读。`seq` 仍只表示节点追加序号。`session.progress` 独立发布完整的当前内存进度，携带单调 `version`、所依赖的持久 `revision`、运行代理与 live 块，以及所有尚未收束的被捕获资源 `unsettledObjectIds`，不触发每个增量的全历史查询。历史分叉依据全部资源的收束状态，代理卡片只依据自身运行状态。进度先于对应持久视图到达时，消费者保留已有块并等待该视图；初次打开或重连通过完整读取恢复两者。两个修订只在任务进程生命周期内用于同步，不写入历史，任务进程退出后仍须重启应用。

块的展示身份使用 `responseId + ordinal`，在内存与持久阶段保持一致；保存后以持久数据接替，不创建另一套块组件。历史节点 ID 继续用于路径、审计和分叉。画布订阅持久视图，对话另行订阅进度。正文与思考按即时增量使用流式 Markdown 渲染。即时思考携带运行时块起点 startedAt，header 据此计时，body 在生成时显示固定高度尾部窗口，结束或中断后显示全文。自动展开与结束折叠由外观偏好分别控制，默认均开启；增量不覆盖手动选择，历史初次打开默认折叠。起点只属于即时进度，未保存的历史耗时不补造。其他块的展开状态不因落库而重置。

## 验证边界

单元与契约测试使用临时 SQLite、合成模型流与 AI SDK mock，不请求真实 provider。真实端点、Electron GUI 和跨平台行为由用户验收。
