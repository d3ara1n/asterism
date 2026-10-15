# 会话与代理能力契约

本文描述能力层契约。会话树、时间线、投影与回溯语义见 [会话树、时间线与回溯](timeline.md)；对象与资源见 [对象模型](object-model.md)。GUI 消费这些接口，组件不进入存储契约。

## 节点数据

| 节点 | 数据 |
| --- | --- |
| message | 来源为接收代理资源、有序输入 parts；文字和文件引用随同一条用户消息保存 |
| thinking / text | core 代理的 `Execution` 记录载荷：response_id、request_parent_id、序号、正文、complete、续接资料与可空终态元数据，由代理插件自行解释 |
| toolcall | 同上请求身份与元数据，加本地/provider 调用 ID、工具名、参数与结局 |
| event | 类型与小载荷；大内容保存到宿主内容存储后以 SDK 内容引用值关联 |
| notice | 来源对象、级别、类型、消息 |

以下块字段均属 core 代理插件的记录载荷，宿主只按通用记录保存、不建索引或约束。block 通过 response_id 关联，response 由代理投影，不设独立 response_end 或 completion 节点。每个块携带 request_parent_id 和请求计算结果（adapter、模型表达式 `<providerId>/<modelId>[:<thinking>]`、协议作用域），以及可空的 completion（usage、finishReason、rawFinishReason、providerResponseId）。响应状态机将终态与最高序号的实际块一同交付，其他块不带计量；每块只提交一次，按响应汇总块的 usage 不会重复计量。系统提示词、角色正文、工具目录、模型参数和完整请求不持久化。

时间线的 thinking、text、toolcall 及其文字、参数与结果是公共领域表达。thinking 必填 `text` 与 `summary`：前者保存协议交付的明文思考，后者保存协议交付的思考摘要；两者可同时存在或为空，不相互填充，也不宣称可见文字包含模型全部内部推理。续接资料独立保存在块级 `continuation`：保留 Anthropic signature/redactedData，以及 OpenAI itemId/reasoningEncryptedContent/phase 白名单，连同 source 记录来源作用域与适配版本。明文、摘要与不透明续接都是公共模型的原生能力；原生资料不能覆盖公共正文，也不决定整段上下文是否可用。不保存原始 HTTP、凭据、响应头或未筛选的 provider metadata。

## 用户输入与文件

用户输入先作为 `UserMessage` 写入时间线，再投影为 `ModelItem.kind = "input"`。纯文件消息同样形成一个 message 节点，文件不必成为工作台对象；同条消息中的文字、文件及其顺序原样保存。引用依赖与消息在同一事务提交，模型请求不另存一份上下文。

输入与 context 的消息正文统一为有序 `parts`：

```ts
type ModelInputPart =
  | { kind: "text"; text: string }
  | { kind: "file"; file: ContentRef; mediaType: string; filename?: string };
```

纯文字也使用 text 部件。文件身份复用宿主 ContentRef，MIME 和可选文件名属于消费元数据；协议不接受路径、URL、base64 或字节本体。系统提示沿用纯文字 PromptBlock；工具结果的模型投影复用同一 parts 形状。

`models.validate(request, { content })` 和 `models.stream(request, { content })` 接收已有的宿主 ContentReader；含文件时不得省略，也不按 ID 全局查找。准备阶段的 content 包含本次输入尝试及合法对象内容。纯文字调用无需 content。`models.run` 根据既有 object/requestParentId 捕获本对象当前数据和本次路径的记录依赖，不接收外部 reader 覆盖。内容读取资格不授予工具访问或跨对象共享权。

三个入口共用输入检查。validate 检查目标、续接、内容归属、封存状态和长度，不发送请求或全量读取字节；实际请求重新检查并读取、校验内容完整性，然后由适配器编码。客户端只区分文字与文件：文件以 ContentRef 引用不可变内容，连同如实识别的 mediaType 发送，不判断模态、不按格式拦截；端点是否接受由服务端反馈。界面预览等展示判断由 mediaType 派生，不构成模型能力。

请求在首次异步等待前固定引用与内容资格，独立占用持续到请求收束，run 包括工具批次。关闭草稿不破坏已捕获请求，取消模型不关闭调用方草稿；流失败、调用方提前关闭和宿主关闭均收束实际使用。限额见 `src/shared/model-media.ts`：图片 5 MiB、其他首期文件 16 MiB、整次请求最多 20 个文件且原始文件总量不超过 20 MiB，重复出现按编码次数累计。超限明确拒绝，不自动降级、拆页或转码。

## 写入时机

- 输入先于执行持久化。
- 流增量由代理执行侧在内存中按块累积，作为临时进度提供给 UI；thinking/text 等响应终态到达后提交给 Session。取消、网络中断或请求失败时仍保存已收到的内容，未完成正文或未执行的工具调用标记 `complete=false`；这些块与其他记录一样推进游标且可导航，模型是否采用由代理投影决定。
- 终态随响应最高序号的实际块保存，不后补、不另设计量节点；收到终态但块不完整时仍保留报告的计量，没有终态时不补造计量。
- toolcall 执行期间不落库，合法产出通过 session.progress 更新；取得结局时调用与结果作为一个节点追加。确认取消记为 cancelled，无法确认写入影响的中止记为 unknown。
- 请求在产生任何块之前失败（鉴权、限流、超时、请求准备失败），代理发出错误级 notice。
- 服务端结束却没有任何内容块时，发出 empty_response 诊断 notice，携带该异常响应的来源和终态资料，不建立伪造块。
- 通知只在保存后发出，消费方重新查询恢复丢失通知。进程崩溃不做兜底与自动重放。

Session 是时间线的单一写入者。含终态的成型记录、对象与链接事件均经同步事务提交；每条记录都取当前游标为父节点，追加记录与推进游标不可交错、没有例外，事务内不等待模型、文件系统或 IPC。资源控制器只持有自己的活动与流状态，通过会话提交接口写入，不直接操作会话树或回溯游标；续接位置由 Session 按全会话收束状态管理。

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

`model` 是 `text | file` 部件，只在终结时由可选 `toModel(data)` 投影；未声明时 data 以 JSON 文本作为一个文字部件，其余结局以文字说明 kind、错误或说明并附有效产出，文件只随成功与部分成功保存。模型适配器只消费保存的 model，不能将 GUI 数据、资源标题或执行时间当作错误对象一起发送。结局同时保存实际实现 ID、请求边界内的资源身份/类型/名称、开始与结束时间。UI 的 headerRenderer/bodyRenderer 接收同一份调用和结果，分别可选；历史按实现身份选择视图并经其 schema 解码，缺失或数据不兼容时使用默认视图。

## 执行循环

工具即时块在 `input` 阶段的 `arguments` 是宽容解析的展示预览，字符串可尚未闭合；`argumentsText` 始终保留原始接收内容。预览只存在于内存进度，正式执行参数仍只由完整块终结事件取得，未完成记录不把修复后的 JSON 当成合法调用。预览身份来自本次请求捕获的资源与工具目录，查找不准备或执行工具。工具参数增量合并后解析与发布，正文与思考仍即时发布，阶段切换立即刷新；工具的可选填充视图、开合偏好与三态连续性遵循 [工作台](workbench.md#工具调用视图)。

模型响应正常结束 → 参数与 agent 工具策略校验 → 显式 resource_id 与本轮有效链接校验 → 执行 → 结局节点保存 → 整批收束 → 下一请求。输出截断与不完整参数不启动工具。并行完成顺序不影响模型输入顺序，投影按序号排列；含顺序工具的批次按原顺序执行。

模型协议中的 tools 是 Atelier 固定操作入口：`resource_list`、`resource_inspect`、`resource_call(resource_id, tool, target?, args)`。两层工具使用同一 ToolContract 与定义投影；一级入口的 guidelines 合入协议说明，二级工具的 description、guidelines、args 及实现的 target/result schema 在资源链接通知或 inspect 中提供，不进入顶层 tools。核心工具与资源平级定义，通过后端实现声明支持关系。链接资源激活匹配工具，agent 的 tools/excludeTools 等外部策略再决定是否允许使用；资源实例不持有工具列表或白名单。宿主入口不受名单约束，也不开放插件注册。请求能力视图从统一目录选择实现并应用链接状态和外部策略；批次按实际实现的副作用和调度策略执行。当前原生资源工具包括目录 list 与文件、笔记的 read/edit/write；MCP 与代理间通信待接入。

一个回合内可有多次模型请求及执行启停，划分见 [运行时](runtime.md#执行轮次)。每次提交或显式继续启动的执行循环独立计算请求上限 `agent.maxTurns`，空值为 32；该字段限制模型请求数，不计用户回合数。timeout 空值为 600 秒，取消协作式中止，不承诺撤销副作用。费用预算字段 maxCost 已于 2026-10-13 移除，不设执行层预算限制；价格与费用计量随[独立计划](../plans/todo-2026-10-14-model-costs.md)另行考虑。

多次请求的循环由内置 Agent 控制器推动。通用 `models.run` 只执行一次模型请求及该响应的工具批次，显式接收投影输入，交付内含终态的块、诊断与临时进度，不自行保存对话或发起下一请求。Agent 将成型输出经会话提交到时间线，随后重新投影下一次输入。轮数、缓存命中预期和停止规则由 Agent 提供；命名等一次性补全消费者直接使用 `models.stream`。

## 环境

代理控制器在每次请求前一起取得消息路径、代理配置与资源授权，再组装系统提示词：当前代码的 harness、当前 agent 配置，以及本次已链接目录资源中的 AGENTS.md（读取不走 resource_call，不缓存）。在途请求及其工具批次保持这份环境；设置与资源变化在下一次请求反映，由此产生的缓存失效属于用户预期。会话树仍实时记录事件，模型投影把请求期间的事件安排在该响应与工具结果之后。代理选择（agent 配置 ID、模型 ID、思考等级、修订号）按代理对象保存，可修改，独立于会话树。所选身份失效时明确失败。

context 唯一真值在时间线。Agent 可以持有选择、计数、取消与活动状态，但不保存另一份 context；消息投影只服务当次调用。上下文裁剪、压缩和选取以时间线事实为依据，不直接改写既有事件或在 Agent 内维持独立历史。

Agent 的回合状态同样从当前时间线推导，经 `AgentView.turnState` 交付；与实时活动组合后形成供外部消费的执行状态，定义与分层见 [执行状态投影](runtime.md#执行状态投影)。模型输入投影与状态投影分别负责协议可发送性和执行完成判断，不完整块仅在前者被过滤。

## 上下文自动压缩

内置代理在请求之间检查预算，以普通摘要记录替换模型输入的旧前缀，近期消息和完整工具批次原样保留。压缩策略、独立摘要提示、保留边界、失败处理与调研依据见 [上下文自动压缩](context-compression.md)。时间线仍是唯一真值；模型执行器不承担压缩策略。

## 模型适配

请求身份与模型内容分开：`stream / validate` 可接收调用方声明的 `userAgent / sessionId`，`run` 接收 UA 并从已校验对象取得 Session ID。内置 Agent、标题命名和上下文压缩均传入 `Atelier/<应用版本>` 与所属会话；会话重开、同会话分支和工具续轮保持同一 ID，新会话使用新 ID。身份不写入模型消息、历史或续接作用域，不授权资源，也不依赖 provider 保存会话。

模型与提供商的 `customUserAgent` 按既有兼容合并规则覆盖调用方 UA，优先级为模型 > 提供商 > 调用方；都未提供时保留 SDK 默认值。显式 `opencodeSession` 才发送 `x-opencode-session`，无会话的独立调用或连接测试为本次调用生成临时 UUID。连接测试使用应用 UA；模型列表发现不发送会话头。最终 HTTP 边界设置身份头，避免 SDK 改写或追加自定义 UA；头值必须为非空可打印 ASCII 字符串，非法值在发送前失败。提供商域名不触发隐式兼容行为。

三协议使用已安装 AI SDK：OpenAI Responses、OpenAI Chat Completions、Anthropic Messages。新增提供商优先 Responses，Anthropic 使用 Messages；聚合服务同产品同地区默认一个预设，只有不同端点对应不同模型集合时才拆分，不按模型上游协议拆分入口。工具定义不提供 SDK execute；关闭隐式重试与流重试。带凭据的远程端点要求 HTTPS，无鉴权模式去除认证头，禁止自动重定向。每个 SDK 调用只进行一个模型步骤，由工坊执行后续循环。Responses 固定 store:false；思考能力开启时基线请求摘要与 encrypted reasoning，端点不支持的请求字段由显式兼容设置省略。连接测试与执行共用 `src/model/request-options.ts` 解释请求选项；测试仅走最小连通 probe，不选择等级或验证续接行为。

每次请求从公共历史向目标模型投影，不因 provider、协议、端点或模型变化而拒绝整段上下文。原生附加资料仅在来源作用域（provider 身份、协议、端点、模型）与适配版本均一致时复用，跨来源只省略不适用的原生资料。公共回答、工具调用与结果继续投影，不增加来源水印、桥接消息或第二份历史。外来工具调用 ID 不满足通用字符／长度范围或与已有身份冲突时，在本次请求内确定性转换，调用和结果成对使用；本来源原始 ID 优先保留。投影不改写时间线，A → B → A 时原先 A 的资料仍可复用。

用户输入与工具结果文件按 mediaType 如实编码；Responses 与 Anthropic 继续使用 SDK 的原生文件表达。Chat Completions 无法承载工具结果文件时，以 `tool_files_unsupported` 在准备阶段明确拒绝；只有显式添加 `toolFilesAsUserMessage` 才将同批文件搬到一条 user 消息，位置固定在该批工具结果之后、下一条历史消息之前，并在 tool 结果中保留关联说明。纯文字结果用 text／error-text 形态，避免二次序列化。服务端工具与模型生成媒体暂不支持。

Responses 模型声明的思考能力以 true 或 false 显式传给 SDK，不依赖 SDK 的 OpenAI 模型名称识别。声明思考能力时，末端检查继承后的标准等级属于可用集合，再按协议编码；off 也是等级，不改变工坊的历史过滤规则。声明不支持思考时，请求省略思考选项及全部历史思考部件，包括明文、摘要与不透明资料，过滤后为空的 assistant 消息不发送。所有过滤只作用于当前请求，不改变历史、展示或响应接收；服务端仍返回思考时正常保存。即时和历史展示均优先使用非空明文，否则显示摘要；这个选择只用于视图，不写回记录或模型输入。纯不透明思考块保留用于续接，不显示空折叠项。

思考续接属于协议基线，不需要启用兼容包。Responses 有可复用密文时发送密文与独立摘要；否则将非空 text 编码为 `content: [{ type: "reasoning_text", text }]`，非空 summary 编码为 `summary: [{ type: "summary_text", text }]`，两者并存时分别发送。只有 item ID 不能替代 store:false 的续接内容。Anthropic 有可复用签名时连同原始明文发送，有 redactedData 时发送遮蔽块；无签名明文直接编码为 thinking，不伪造签名。Anthropic 不能表达独立摘要时省略摘要；Chat 尚无公共思考输入编码，继续省略历史思考。跨来源仅移除不适用的原生资料，明文与摘要仍按目标协议各自表达。端点实际是否接受某种输入由服务端反馈，不做失败重试、自动降级或思考转助手正文。

原始流事件读取始终开启。Responses 按 reasoning item 的 added／done 生命周期交付一个 thinking 块：`response.reasoning_text.delta` 进入 text，`response.reasoning_summary_text.delta` 进入 summary，多段摘要以段落分隔合并，密文在 item 结束时交付。SDK 对同一 item 派生的 reasoning 事件不重复消费，也不因某个摘要段结束而提前结束整个块。Anthropic SDK reasoning 增量进入 text，签名与遮蔽资料按白名单累积。公开 `part.delta` 的 `channel: "summary"` 只允许用于思考块，缺省进入 text。原始帧不持久化或写入日志。

Responses 系统提示默认只发送在顶层 `instructions`；显式添加 `systemMessageInMessages` 时，改为 `input` 第一条 `system` 消息，不同时发送 `instructions`。参数型 `responsesReasoning` 只适配端点字段：`content` 为 array（缺省）或 object；`encryptedContent`、`summary` 缺省为 true，false 分别省略加密内容 include 和 reasoning.summary 请求参数。它们不决定历史明文、摘要或已有密文能否参与请求。SDK 自动补充的请求参数也在最终发送边界按此约定处理。

Responses 与 Messages 的思考输入通过 SDK 公开语言模型中间件和传输入口编码：编码前固定思考与非思考部件的顺序，普通消息、文件和工具继续由 SDK 编码；发送前核对序列化结果并补充对应思考部件。Messages 按相邻角色分组后核对正文与调用身份，签名对应的原文不裁剪或改写。不匹配时明确失败，不猜测位置、不伪造密文或插入文本哨兵，不提供通用 JSON patch。计划只存在于单次调用，原生资料选择、公共内容转换与兼容设置共用同一次目标投影。字段依据见 [DeepSeek](https://api-docs.deepseek.com/guides/responses_api/)、[Kimi](https://platform.kimi.ai/docs/api/responses) 和 [智谱](https://docs.bigmodel.cn/api-reference/response/创建-response) 官方文档。

模型兼容包由用户显式添加到提供商或具体模型；本次请求的两层配置按 id 合并，模型同名条目整项优先，不深合并参数、不回写配置。`appliesTo` 中的协议、端点仅供 UI 参考，不用于自动启用或运行时匹配。编码器只解释其协议下认识的已添加行为。实现与真实端点／GUI 验收进度见 [模型兼容计划](../plans/todo-2026-10-10-model-compatibility.md)及 [跨模型续接计划](../plans/todo-2026-10-13-cross-model-continuation.md)。

## 前端能力接口

`window.host.session` 提供 `execute` 与 `onChanged`，IPC 版本为 19。资源与布局命令也属于此会话入口。应用通道只读取工作区身份和会话列表，不持有已打开会话的正文。

| 命令 | 行为 |
| --- | --- |
| `start` | 显式 agent 配置，模型与 thinking 可为 null 并在请求时继承；原子保存 Session、首个代理、首条输入并开始执行 |
| `resource.command` | 路由到对象所属资源控制器；代理命令为 `submit`（追加消息并执行，仅本代理运行中返回 conflict）、`continue`、`configure`（修改资源私有选择，下一请求生效）、`cancel`（只停止该代理） |
| `resource.create` | 由资源模块校验 input 并创建对象：代理需显式选择，笔记可空正文，目录须为存在的绝对路径 |
| `read` | 同次读取返回会话树、执行游标、工作台投影和当前进度，不接受独立历史位置 |
| `select` | 会话所有被捕获的资源均 settled 时选择位置；记录原位置与所选位置，与游标更新同事务提交，不追加模型可见节点，不吸附 |
| `object.remove` | 对象 settled 后移除，并解除全部入向、出向链接；未收束时返回 conflict，不隐式取消活动 |
| `link.set` | 变更指定会话的资源关系，事务提交后通知 |
| `view.set` / `viewport.set` | 保存当前布局，不修改历史 |

命令返回 `accepted` 与会话身份，不附带展示数据；`read` 返回 `view`。start/submit 的 submissionId 为 UUID，相同身份与内容重复提交只返回已有会话身份，内容不同返回 conflict。业务身份包含 parts 的引用、元数据和顺序，不包含临时内容信封身份。首页 start 已有受理回执时，重试可省略原内容信封，不要求原草稿仍有效；尚未受理的输入仍须通过内容资格检查。

`resource.create` 的受理回执表示对象创建事件、资源私有状态与初始布局已提交；前端随后读取新投影以更新画面。后端的串行事务保证时间线写入顺序，前端的投影同步保证后续意图使用已确认的展示状态，两者职责不同。

会话视图模块统一读取执行游标对应的工作台与对话，不持有独立查看位置。历史面板只维护候选节点与分支选择；明确继续时提交 `select`，成功后重新读取当前游标。命令受理不会覆盖展示，查询成功后统一交付新画面。资源存在性和链接由宿主重建，运行时仍执行资源身份与授权校验。

命令已受理但新投影未取得时，视图仍未就绪，不允许基于旧配置或链接继续构造领域命令。就绪视图上连续入队的操作意图（例如一次拖入多个目录）依次等待前项投影同步后再受理，并重新检查执行时的同步状态；同步失败时拒绝后项并显示原因。读取失败时保留原画面并标记错误；重新读取成功前保持操作门禁。会话错误由会话模块持有，工作台提供独立于代理卡片的提示，模态操作在对应对话框内显示原因；后台读取不会自动清除操作错误。

`session.changed` 携带会话身份与持久视图修订 `revision`，节点、选择或布局变化后通知重读。`seq` 仍只表示节点追加序号。`session.progress` 独立发布完整的当前内存进度，携带单调 `version`、所依赖的持久 `revision`、运行代理与 live 块，以及所有尚未收束的被捕获资源 `unsettledObjectIds`，不触发每个增量的全历史查询。历史分叉依据全部资源的收束状态，代理卡片只依据自身运行状态。进度先于对应持久视图到达时，消费者保留已有块并等待该视图；初次打开或重连通过完整读取恢复两者。两个修订只在任务进程生命周期内用于同步，不写入历史，任务进程退出后仍须重启应用。

块的展示身份使用 `responseId + ordinal`，在内存与持久阶段保持一致；保存后以持久数据接替，不创建另一套块组件。历史节点 ID 继续用于路径、审计和分叉。画布订阅持久视图，对话另行订阅进度。正文与思考按即时增量使用流式 Markdown 渲染；实时块的 endedAt 标识正文结束，等待响应终态不延长生成状态。即时思考携带运行时块起点 startedAt，header 据实际起止时间计时，body 在生成时显示固定高度尾部窗口，结束或中断后显示全文。自动展开与结束折叠由外观偏好分别控制，默认均开启；增量不覆盖手动选择，历史初次打开默认折叠。起止时间只属于即时进度，未保存的历史耗时不补造。其他块的展开状态不因落库而重置。

## 验证边界

单元与契约测试使用临时 SQLite、合成模型流与 AI SDK mock，不请求真实 provider。真实端点、Electron GUI 和跨平台行为由用户验收。
