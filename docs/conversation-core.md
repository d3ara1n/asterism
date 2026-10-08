# 会话与代理能力契约

本文描述能力层契约。会话树结构、投影与回溯语义见 [会话树、历史与回溯](timeline.md)；对象与资源见 [对象模型](object-model.md)。GUI 消费这些接口，组件不进入存储契约。

## 节点数据

| 节点 | 数据 |
| --- | --- |
| message | 目标 agent_id、用户正文；首批仅文本 |
| thinking / text | agent_id、response_id、序号、正文、complete、可选续接资料 |
| toolcall | agent_id、response_id、序号、本地与 provider 调用 ID、工具名、参数、结局 |
| event | 类型与小载荷；大内容存 `objects/<hash>` 后引用 |
| notice | 来源对象、级别、类型、消息 |

响应的用量（缺失为 null）、原始与归一化结束原因、服务端 responseId，以及请求计算结果（adapter、模型表达式 `<providerId>/<modelId>[:<thinking>]`、协议作用域）挂在该响应末个块上。系统提示词、角色正文、工具目录、模型参数和完整请求不持久化。

续接资料保存为带适配版本的块级不透明字段：保留 Anthropic signature/redactedData，以及 OpenAI itemId/reasoningEncryptedContent/phase 白名单。不保存原始 HTTP、凭据、响应头或未筛选的 provider metadata。

## 写入时机

- 输入先于执行持久化。
- 流增量在运行时内存中按块累积；块完成时追加节点。取消、网络中断或请求失败时，已收到的部分以 `complete=false` 追加。
- toolcall 执行期间不落库；取得结局时调用与结果作为一个节点追加。用户打断记为 cancelled。
- 请求在产生任何块之前失败（鉴权、限流、超时、请求准备失败），代理发出错误级 notice。
- 通知只在保存后发出，消费方重新查询恢复丢失通知。进程崩溃不做兜底与自动重放。

## 工具结局

每个工具声明参数 schema、所需权限、读写副作用、顺序/并行策略与执行器。结局为：

- succeeded：保存当次交给模型的 `model` 内容和用于重建视图的 `data`。
- rejected：工具策略、参数或授权拒绝。
- failed：已知失败。
- cancelled：已取消，包括用户打断。
- partial：已知部分结果及剩余说明。

协议需要错误布尔值时由适配层映射。结果形态按工具类型固定，不按长度分派内联或引用。

## 执行循环

模型响应正常结束 → 参数与 agent 工具策略校验 → 显式 resource_id 与本轮有效链接校验 → 执行 → 结局节点保存 → 整批收束 → 下一请求。输出截断与不完整参数不启动工具。并行完成顺序不影响模型输入顺序，投影按序号排列；含顺序工具的批次按原顺序执行。

模型可见工具为资源类全局工具：`resource_list`、`resource_inspect`、`resource_call(resource_id, tool, args)` 等。资源工具 schema 不进入顶层 tools，在资源链接通知或 inspect 中提供；执行层严格校验参数。首批原生资源工具为笔记的 read；目录、编辑、MCP 与代理间通信待接入。

一个执行轮次内可有多次模型请求。轮次请求上限采用 agent.maxTurns，空值为 32；timeout 空值为 600 秒，取消协作式中止，不承诺撤销副作用。maxCost 尚无价格契约，设置后明确拒绝启动。

## 环境

代理控制器在每次请求前组装系统提示词：当前代码的 harness、当前 agent 配置，以及该代理当前链接的目录资源中的 AGENTS.md（读取不走 resource_call，不缓存）。设置与文件变化即时反映；由此产生的缓存失效属于用户预期。代理选择（agent 配置 ID、模型 ID、思考等级、修订号）按代理对象保存，可修改，独立于会话树。所选身份失效时明确失败。

## 模型适配

三协议使用已安装 AI SDK：OpenAI Responses、OpenAI Chat Completions、Anthropic Messages。工具定义不提供 SDK execute；关闭隐式重试与流重试。带凭据的远程端点要求 HTTPS，无鉴权模式去除认证头，禁止自动重定向。每个 SDK 调用只进行一个模型步骤，由织台执行后续循环。OpenAI Responses 使用 store:false 并请求 encrypted reasoning。

直接续接要求 provider、协议、端点、模型标识和适配版本兼容；不兼容时在提交前明确失败。图片与服务端工具暂不支持。

## 前端能力接口

`window.weft.session` 提供 `execute` 与 `onChanged`，IPC 版本为 2。

| 命令 | 行为 |
| --- | --- |
| `start` | 显式 agent 配置、模型和 thinking；原子保存 Session、首个代理、首条输入并开始执行 |
| `submit` | 在游标处向指定代理追加消息并执行；运行中返回 conflict |
| `continue` | 从当前合法位置继续指定代理 |
| `configure` | 修改代理选择，不追加历史；下一请求生效 |
| `read` | 读取会话树、游标、已提交序号与运行状态 |
| `select` | 会话 settled 时移动游标；只追加选择事件，非法继续点退到合法祖先 |
| `cancel` | 请求停止；终态通过通知或查询观察 |

start/submit 的 submissionId 为 UUID，相同身份与内容重复提交只返回已有会话，内容不同返回 conflict。通知带 sessionId、已提交序号与选择修订。

## 验证边界

单元与契约测试使用临时 SQLite、合成模型流与 AI SDK mock，不请求真实 provider。真实端点、Electron GUI 和跨平台行为由用户验收。
