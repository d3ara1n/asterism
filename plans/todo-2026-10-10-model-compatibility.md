# 模型兼容包与标准思考等级

> 立案 2026-10-10。L0 请求选项收口、L1 标准思考等级、L2a 定义／存储／UI 与 L2b 首批兼容消费已实施；GUI 与真实端点待验收。`customThinkingLevels` 单独暂缓。跨模型续接共用本轮目标投影，其验收记录见 [续接计划](todo-2026-10-13-cross-model-continuation.md)。

## 已确认设计

- 兼容包是应用预定义、数量有限的行为声明，不是 processor，也不加载用户手写 patch。每个定义有稳定 id、参数 schema（标签型无参数）、名称与说明（直接取 schema 原文，不另做本地化），以及独立的 `appliesTo`。
- `appliesTo` 包含协议列表与可选端点列表，只供用户参考，不用于自动启用、添加限制或运行时匹配。编码器只解释当前协议下认识的已添加行为。名称不必重复适用协议，例如 `thinkingInDeepSeekFormat`。
- 提供商与具体模型分别保存已添加项的稀疏列表，同层 id 不重复。提供商条目对其所有模型生效，消费时按 id 合并，模型同名条目整项优先，不深合并参数。移除模型覆盖恢复提供商条目；模型空列表不禁用提供商条目，无 false/null 墓碑。合并结果不回写配置。
- 提供商与模型设置 UI 共用「添加兼容设置」；标签型展示名称、适用参考与移除，有参数的由 schema 生成编辑器。模型页只读展示提供商条目，参数条目可复制为模型覆盖，覆盖项标明来源。添加菜单同样展示协议与端点参考。
- 参数是否必填由 schema 决定，可选字段支持未设置，省略行为由包定义。模型整项覆盖后，省略字段不会从提供商条目补齐。
- 不按品牌、域名或模型名自动启用兼容行为。预设或目录可以推荐，是否添加由用户决定。
- 思考能力属于标准模型能力：`reasoning` 总开关之下，标准等级为 `off/minimal/low/medium/high/xhigh/max`，`xhigh` 与 `max` 独立，由 `thinkingLevels` 声明可用集合；初始全开，空集合合法。兼容包不能开放被关闭的等级。
- 模型与等级的 null 逐层继承。配置保存与选择传递不拦截等级可用性；请求末端 reasoning 为 true 时，最终等级为空或不在集合中均以 `thinking_unavailable` 失败，不自动降档。
- reasoning 为 false 时不发送等级及历史思考，但正常接收、保存、展示新返回的思考；off 只是普通等级，不触发工坊历史过滤。配置与投影均不改写历史。
- 正常 OpenAI 密文／Anthropic 签名续接，以及原始流读取与已知思考事件解码属于基线，不需要兼容标签。原生资料只在来源作用域与适配版本可用时回传；公共回答与工具记录不因来源不同而整段拒绝。
- 连接测试保持最小 probe，只验证基础协议连通性，不选择等级或验证兼容行为；与执行路径共享请求选项解释入口。

## 已接入的 L2b 标签

| id | 适用协议参考 | 行为 |
| --- | --- | --- |
| `systemMessageInMessages` | OpenAI Responses | 基线把系统提示放在 instructions；添加后改为 input 的第一条 system 消息，不同时发送 instructions |
| `thinkingInDeepSeekFormat` | OpenAI Responses；端点参考 `https://api.deepseek.com` | 将公共可见思考按原位置编码成独立 reasoning item，content 使用 reasoning_text；不带来源签名、密文或 item ID，不转为助手正文 |
| `toolFilesAsUserMessage` | OpenAI Chat | 基线无法表达工具结果文件时明确报错；添加后才将同批文件放入工具结果批次之后、下一条历史消息之前的 user 消息，并保留 tool 关联说明 |

Responses 原始 `reasoning_text` 解码始终可用，不受域名或兼容包控制。同一 item 同时提供原始与 SDK 正文事件时，只消费首个产生文字的通道，继续收集原生元数据。

`customThinkingLevels` 不属于本次 L2b：标准等级 → 服务端字符串的稀疏映射、未填写回落、budget 忽略的语义保留，待 SDK 编码方案确认后另行实现。Qwen 标签格式也不在本次接入范围，不能与 DeepSeek Responses 明文 item 混为一类。

## 实现边界

- `src/shared/model-compatibility.ts` 承接定义目录、条目校验与两层合并。提供商与模型以必填 compatibility 列表分别保存显式条目，初始 `[]`；配置文件版本 5，配置 IPC 版本 6，不提供旧格式迁移。
- 标签保存 `{ id }`，参数设置保存 `{ id, value }`；未知 id、重复 id 与非法参数在配置边界拒绝，参考协议不阻止保存。设置页与快捷启停都保留完整列表。
- `src/renderer/shared/ConfigurationValue.tsx` 为提供商／模型兼容设置与插件配置共用的 schema 编辑器。
- `src/model/projection.ts` 每次从公共历史生成目标内容，解释已添加的兼容行为；`continuation.ts` 只判断原生资料的可复用性。公共正文、思考与工具记录的存储格式不变。
- `src/model/deepseek-reasoning.ts` 通过公开 SDK 中间件在编码前固定明文思考的顺序，公开 fetch 入口逐项核对 SDK 序列化结果并补充 reasoning item。消息、文件与工具编码继续复用 SDK；对应关系不符明确失败，不猜测位置、不伪造密文／签名、不使用文本哨兵。不建立通用请求体 patch。
- SDK 内部模型名推断仍属于依赖行为，本轮不修改依赖源码或引入新依赖；相关控制能力须另行核验，不宣称工坊清除域名分支等于消除 SDK 所有内部推断。
- 正式目录只包含三个有请求行为的标签；保留参数型定义、schema 编辑器与整项覆盖能力。

## 思考格式核验

- [DeepSeek Responses 官方指南](https://api-docs.deepseek.com/guides/responses_api)：输入接受独立 reasoning item 的明文 content，由服务端合入相邻 assistant；不支持 summary／encrypted_content 输入。这不要求客户端将思考改成普通正文或加 think 标签。输出使用 response.reasoning_text.delta，instructions 插入为第一条系统消息。
- [DeepSeek Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode)：Chat 用与 content 同级的 reasoning_content。当前文档规定携带 tools 时后续请求必须完整回传历史思考，否则 400；不携带 tools 时不需要回传，传入也忽略。不可用旧 R1 规则概括当前接口；Chat 思考字段接入不属于本次明文 Responses 标签。
- [Qwen3-32B 官方模板](https://huggingface.co/Qwen/Qwen3-32B/blob/main/tokenizer_config.json)：可以读取 reasoning_content，也能从正文中的 think 标签解析思考；最后一个真实 user 查询之前的历史不渲染思考，之后的工具循环按条件渲染。模型原始模板不等于所有托管 HTTP 接口要求客户端发标签。
- [百炼深度思考](https://help.aliyun.com/zh/model-studio/deep-thinking)：输出分别使用 reasoning_content 与 content；部分型号支持 preserve_thinking 控制历史思考取用，默认值和支持范围按型号区分。
- 以上为官方文档／源码核验，不是本轮真实端点验收。

## 待办

- [x] L0：连接测试与执行共用请求选项入口，probe 保持最小连通测试。
- [x] L1：标准等级集合、选择器、null 继承与末端校验。
- [x] L2a：定义目录、模型列表 schema、配置存储及设置 UI。
- [x] L2b：Responses 系统提示基线 instructions 与首条 system 标签。
- [x] L2b：原始思考事件解码基线，移除域名限制并避免正文重复交付。
- [x] L2b：Chat 工具文件默认拒绝，显式标签才搬运。
- [x] L2b：DeepSeek 明文 reasoning item，移除旧域名触发的无标签文字转换。
- [x] 兼容与跨模型共用目标投影，来源只限制原生资料复用。
- [x] 同步正式模型配置与投影契约。
- [x] 提供商兼容配置、两层统一合并消费、模型页来源与整项覆盖展示。
- [ ] GUI 验收：两层添加、编辑、移除、保存重开、协议／端点参考展示；模型页提供商来源、参数整项覆盖及移除覆盖后恢复。
- [x] 临时兼容包测试完成；清理临时定义、目录引用与专用测试。
- [ ] 真实端点验收三个正式标签及原生续接，不以隔离测试替代。
- [ ] 暂缓：确认 SDK 编码方案后实现 customThinkingLevels。

## 验证与验收

- `npm run typecheck`、`npm test`（69 个测试文件、444 项）、`npm run build` 与 `npm run i18n:check` 通过。构建仍有部分产物超过 500 kB 的提示；测试中的 SDK 提示为思考模式下忽略 temperature。
- 自动化使用合成协议响应和注入传输，不访问真实服务或凭据；在实际 HTTP 正文边界检查系统提示唯一性、明文思考顺序、图片保留、工具配对和原生资料隔离。
- 提供商兼容改动的类型检查、9 个相关测试文件（151 项）、构建与 i18n 检查通过；包含配置保存、合并与实际 HTTP 正文消费，以及执行／插件／会话路径。构建仍有既有的大产物提示。
- 配置契约验证两层分别保存并重开，非法候选不污染已保存值，移除后不重现；合并验证同 id 去重、模型参数整项覆盖、省略字段不补齐、移除覆盖恢复及来源配置不变。
- 原生资料基线与 A → B → A 的隔离验证见续接计划；签名、密文和空／不可见思考不能凭空转成公共全文。
- GUI 与真实端点仍待用户验收，计划不归档。

交接验收重点：核对 appliesTo 仅供展示、无域名自动启用；检查三个标签的最终请求编码、原生思考事件去重、Chat 附件相对历史消息的顺序，以及 OpenAI ↔ Anthropic 的 A → B → A 原生资料隔离。代码与契约检查可离线执行；GUI 与真实端点由用户操作。

## SDK 编码限制参考

- 已核验 ai@7.0.137、@ai-sdk/openai@4.0.91、@ai-sdk/anthropic@4.0.78：Chat reasoningEffort 与 Anthropic effort 有运行时固定枚举校验；Responses 虽接受字符串，部分模型名仍触发支持列表过滤。
- Anthropic 显式传入 effort 会跳过顶层 reasoning 的 thinking 模式推导；仅改变 effort 不能保证 adaptive／budget 行为。自定义模型别名当前可能落入 budget，字符串映射不能自行强制 adaptive。
- 通用中间件位于 provider 校验之前，不能直接绕过上述 effort 限制。DeepSeek 明文输入的限定投影不等于已解决自定义 effort 编码；后者继续暂缓。
