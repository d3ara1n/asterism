# 模型兼容包与标准思考等级

> 立案 2026-10-10。L0 请求选项收口、L1 标准思考等级与 L2a 兼容包定义／存储／UI 已实施，功能验收待完成。L2b 为移除旧隐式兼容、接入首批显式兼容包；`customThinkingLevels` 单独暂缓。L2a 消费效果随首个正式兼容包验收。跨模型续接不属于本计划，见 [续接计划](todo-2026-10-13-cross-model-continuation.md)。

## 已确认设计

- 兼容包是应用预定义、数量有限的行为偏转，不是 processor，也不是用户手写加载的 patch。每个兼容包有一份定义：稳定 id、参数 schema（标签型无参数）、名称与说明（取自 schema 原文，不另做本地化）、适配协议标记。定义描述 UI 显示什么、保存哪些数据；行为由协议投影代码认识 id 后自行解释。
- 兼容包附加在具体模型上，兼容是按模型来的。模型的兼容配置是已添加兼容包的列表，同一 id 不重复；列表中没有某个包，即不做任何偏转。
- 设置 UI 中兼容区是标准字段之后的可选附加区域：默认只有「添加兼容设置」；选择一个兼容包后加入列表，标签型只显示名称与移除，有参数的由 schema 生成编辑器；不需要就移除。
- 添加菜单与已添加项显示兼容包的适配协议，但不阻止用户添加到其他协议的模型；协议不适用时投影层忽略该包。
- 不按品牌、域名或模型名自动启用兼容行为。预设或目录可以推荐，是否添加由用户决定。
- 思考能力属于标准模型能力：`reasoning` 总开关之下，按标准等级（`off/minimal/low/medium/high/xhigh`）逐项开关可用等级。UI 选择器据此提供选项，执行时再次校验；兼容包不能开放被关闭的等级。
- 模型声明不支持思考时，请求不发送思考参数，历史中的思考内容也不回传给它。
- 标准等级初始全开，空集合合法。AgentSelection 的模型与等级可空，表示继承；UI 不复制角色默认值。最终模型无法解析时失败；reasoning 为 true 时，最终等级为空或不在集合内，以 `thinking_unavailable` 失败。配置保存和选择传递不拦截等级可用性，不自动降档或改写选择。
- off 是普通等级，不控制历史思考过滤。reasoning 总开关只决定当前请求是否发送等级和历史思考；任何情况下都正常接收、保存和展示新返回的思考。关闭能力不清理历史，重新开启后下一请求可回传历史思考。
- 连接测试只验证基础协议连通性，保持最小 probe，不选择等级、不验证兼容行为；与执行路径共享请求选项解释入口。

## 首批兼容包

| id | 参数 | 适配协议 | 行为 |
| --- | --- | --- | --- |
| 系统提示作为消息（id 暂用 `responsesSystemMessage`） | 无（标签） | OpenAI Responses | 基线把系统提示放在 `instructions`；添加后改为 `input` 的第一条 `system` 消息，不同时发送 `instructions` |
| 工具文件作为用户消息（id 待定） | 无（标签） | OpenAI Chat | 基线无法表达工具结果文件时明确报错；添加后才把文件搬到后续 user 消息，并保留 tool 关联说明 |
| 思考历史编码兼容（定义待对齐） | 待定 | 按具体接口声明 | 依据已核验的字段／模板编码，不沿用按域名转普通文字的旧实现；DeepSeek Responses 明文 reasoning item 与 Qwen 原始 think 标签格式须区分 |

L2a 只提供机制，L2b 以旧兼容迁移作为首批真实消费者：移除域名／品牌自动启用，把确需改变编码的行为交给用户显式添加。Responses 原始事件读取与已知 `reasoning_text` 解码属于基线能力，去掉域名限制，不提供兼容开关。SDK 内部模型名推断的处理边界仍需单独确定，不把删除工坊分支等同于消除 SDK 内部行为。

`customThinkingLevels` 不属于本次 L2b：其标准等级 → 服务端字符串稀疏映射、未填写回落、budget 忽略的语义保留，待 SDK 编码方案确认后另行实现。

## L2a 实现与验收边界

- `src/shared/model-compatibility.ts` 声明有限目录、标签／参数定义和条目校验。模型以必填 `compatibility` 列表保存已添加项，初始 `[]`；配置文件版本为 4，配置 IPC 版本为 5，不提供旧格式迁移。
- 标签保存 `{ id }`，参数设置保存 `{ id, value }`；未知 id、重复 id 与非法参数在配置边界拒绝，协议不匹配不阻止保存。设置页与快捷启停都保留完整列表。
- `src/renderer/shared/ConfigurationValue.tsx` 承接共享 schema 编辑器，模型设置与插件配置复用；兼容包名称和说明直接显示 schema 原文。
- `src/shared/model-compatibility-preview.ts` 暂时提供 `previewTag` 与 `previewOptions`，分别用于无参数标签和参数表单的 GUI 验收；均无请求行为。验收后先移除模型中保存的预览条目，再移除临时定义文件及目录引用。
- 本轮不做功能验收，不以类型检查、构建或文案检查宣称 GUI、存储交互或请求消费验收通过。后端定义／校验／存储先实现，消费效果留到正式兼容包接入后验收。
- 静态检查：`npm run typecheck`、`npm run build`、`npm run i18n:check` 通过；构建仍提示部分产物超过 500 kB。未运行功能测试、GUI 或真实端点验收。

## 现状

`src/model/request-options.ts` 收口 probe 与执行的请求选项，`src/model/ai-sdk.ts` 负责消息投影和响应解码。现有 `api.deepseek.com` 域名判断仍用于解码 Responses 的 `reasoning_text` 增量、把思考作为无标签的助手文字回传、系统提示使用 system 身份；Chat 工具文件也仍自动搬运。上述隐式行为尚待 L2b 清理，不能直接将旧思考转换认定为正确的 Qwen／DeepSeek 编码。相关实现描述见 `docs/conversation-core.md` 的模型适配一节。

## 思考格式核验

- [DeepSeek Responses 官方指南](https://api-docs.deepseek.com/guides/responses_api)：输入接受独立 `reasoning` item 的明文 `content`，由服务端合入相邻 assistant；不支持 `summary`／`encrypted_content` 输入。这不是要求客户端把思考改为普通 assistant 正文，更没有要求加 `<think>`。输出使用 `response.reasoning_text.delta`。同一指南明确支持 `instructions`，插入为第一条系统消息。
- [DeepSeek Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode)：Chat 用与 `content` 同级的 `reasoning_content`。当前文档规定携带 tools 的后续请求必须完整回传历史思考，否则 400；不携带 tools 时不需要回传，传入也忽略。不可用旧 R1 规则概括当前接口。
- [Qwen3-32B 官方 tokenizer 配置](https://huggingface.co/Qwen/Qwen3-32B/blob/main/tokenizer_config.json)：原始 chat template 接受 `reasoning_content`，也能从正文中的 `<think>…</think>` 解析思考；最后一个真实 user 查询之前的 assistant 历史不渲染思考，之后的工具循环按模板条件渲染。它是模型输入文本模板，不等于所有托管 HTTP 接口要求客户端发标签。
- [百炼深度思考文档](https://help.aliyun.com/zh/model-studio/deep-thinking)：输出分别使用 `reasoning_content` 与 `content`；部分模型支持 `preserve_thinking` 控制历史思考取用，默认值和支持范围按型号区分。不能把全部 Qwen 接口定义为正文标签编码。
- 用户倾向可识别的格式名称，如 `thinkingInQwenFormat`；命名必须标明实际适用格式，不以品牌名代替接口契约。具体标签与适配范围待对齐。以上为文档／源码核验，未访问真实模型端点。

## 待办

- [x] L2a：定义兼容包目录与模型兼容列表 schema，接入配置存储及版本；验收待完成。
- [x] 模型设置接入标准等级集合；首页、代理创建、对话与角色选择器按能力提供等级。失效选择保留，最终继承完成后校验。
- [x] L2a：设置 UI 接入兼容区：添加、移除、schema 参数编辑、适配协议显示；验收待完成。
- [ ] 临时条目 GUI 验收后移除已保存预览配置、临时定义和目录引用。
- [ ] L2b：Responses 系统提示基线改为 instructions，显式标签切换为第一条 system 消息，保证只发送一份。
- [ ] L2b：原始事件读取与已知 Responses 思考正文解码成为基线，去掉域名限制并避免与 SDK 解码重复交付。
- [ ] L2b：Chat 工具结果文件默认明确报不支持，显式兼容包才搬运到 user 消息。
- [ ] L2b：按已核验协议确定思考历史编码包，移除旧域名触发的无标签文字转换；不能将 DeepSeek Responses 和 Qwen 原始模板混为一类。
- [ ] 暂缓：确定 AI SDK 编码缺口的补充方式后实现 `customThinkingLevels`；不默认采用 fetch JSON 改写、内部 SDK 入口或引入新依赖。
- [x] 连接测试与真实执行共用请求选项解释入口，probe 保持最小连通测试。
- [ ] 将现有域名分支迁为显式兼容包并移除。
- [x] 同步 L2a 的模型独占列表、schema 表单与存储契约。
- [ ] 首个正式兼容包接入后验收后端消费；真实端点与 GUI 由用户验收后归档。

## 验收

- 新建模型默认无兼容包；逐项添加、编辑、移除、保存、重开后结果一致。
- 关闭某个标准等级后，各选择器不再提供该等级，请求也不接受它。
- 自定义字符串到达实际请求；budget 路径不受影响。
- 自动化验证使用合成协议响应与注入传输，在真实序列化请求边界断言；不访问真实服务或凭据。

## 参考

- 本机 pi 的 compat schema 与 `thinkingLevelMap`：有限选项与等级映射的实际用途；工坊不采用其域名自动判断与提供商／模型合并。
- 已核验锁定版本 `ai@7.0.137`、`@ai-sdk/openai@4.0.91`、`@ai-sdk/anthropic@4.0.78` 的源码及注入假传输：Chat 的 `reasoningEffort` 与 Anthropic `effort` 在请求前执行固定枚举校验；Responses 的入口接受字符串，但部分模型名触发支持列表过滤，会删除自定义 effort。
- Anthropic 显式传入合法 `effort` 会跳过顶层 `reasoning` 的 thinking 模式推导；仅改 effort 不能保证保留原有 adaptive／budget 行为。自定义模型别名当前由 SDK 落入 budget 路径，字符串映射不能自行强制 adaptive。
- 通用语言模型中间件位于 provider 校验之前，不能绕过上述限制。Anthropic 的 `transformRequestBody` 未通过常规 `createAnthropic` 配置公开；自定义 fetch 是公开传输入口，但是否承担最终请求字段投影须单独确认。以上是 SDK 调查结果，不是 L2b 实现或功能验收。
- OpenAI Responses 支持 `instructions` 与 `systemMessageMode`。Chat 协议设置 `forceReasoning` 会使 SDK 改用 developer 角色，并可能丢弃 temperature／topP；L2a 不改变这些请求选项。
