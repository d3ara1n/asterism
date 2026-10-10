# MCP 延迟加载与提示缓存

核实日期：2026-09-17。以下区分协议事实、provider 能力与工坊自身的初版策略；具体可用模型、代理服务兼容性和 API 参数需在接入时重新核验。

## 结论

“lazy MCP”不一定指同一种机制：延迟连接服务器、延迟拉取工具 schema、延迟向模型加载工具定义，是三个不同层次。

延迟连接本身不保护提示缓存。能在发现工具时保留已有模型前缀的关键，是让新定义进入上下文后部，而不是重写先前的 tools/system 前缀。这可以由 provider 原生工具搜索实现，也可以用稳定的搜索/执行分发协议实现；两者不是同一种机制。

HTTP 请求里的 tools 数组与最终渲染给模型的工具前缀也不完全等同。服务端可以识别 deferred 定义，并将它们移出初始模型前缀。

## MCP 标准层

[MCP 工具规范（2025-06-18）](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) 定义了工具列举、调用和列表变化通知，包括 tools/list、tools/call、notifications/tools/list_changed。

这些操作不规定客户端必须把全部工具塞进某个模型的 tools 参数，也不保证模型提示缓存命中。工具列表的客户端缓存与模型 prompt cache 是不同的缓存。

因此不能仅凭一个客户端标注 lazy，就认定它不会改写模型工具前缀。需要检查它如何构造后续模型请求。

## 三类实现

### 1. 只延迟连接或获取 schema

客户端在第一次需要时连接 MCP server、获取工具定义，再把定义加入普通的原生 tools 参数。

这种实现减少启动工作或无用连接，但可能改变模型前缀。它不天然解决缓存问题。

### 2. Provider 原生延迟工具加载

模型服务专门支持将发现的工具定义加载到对话后部，并让这些定义成为可调用工具，而不只是普通文本。

#### Anthropic

[Tool search tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool) 明确说明：

> Internally, the API excludes deferred tools from the system-prompt prefix.

> When Claude discovers a deferred tool through tool search, the API appends a `tool_reference` block inline in the conversation, then expands it into the full tool definition before passing it to Claude.

> The prefix is untouched, so prompt caching is preserved.

要点：

- 在请求的 tools 中提供工具目录，对延迟工具标记 defer_loading。
- 请求仍需提供对应完整工具定义；延迟的是进入模型上下文，不一定是传输定义。
- 初始上下文加载工具搜索入口和非延迟工具。
- 发现结果通过 tool_reference 进入会话；由 API 展开，不是宿主把 schema 手动插回 system。
- 后续请求保留搜索结果历史和对应定义，使已发现工具可复用。
- 自定义搜索工具也可以返回 tool_reference，但需要相应 API 支持；不能假定所有兼容代理都会正确转发。

缓存细节参见 [Tool use with prompt caching](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-use-with-prompt-caching)。

#### OpenAI

[Tool search](https://developers.openai.com/api/docs/guides/tools-tool-search) 对支持该能力的 Responses API 模型说明：

> When new tools are discovered by the model, they are injected at the end of the context window.

> All tools are loaded at the end of the model’s context window. This holds true for both hosted tool search and client-executed tool search.

支持服务端搜索和客户端执行搜索；后者由应用返回 tool_search_output。不能据此推断任意模型或任意 Chat Completions 兼容服务都支持。

官方文档还明确指出，改写既有 tool_search_output 中的已加载工具集合会从该位置起破坏缓存：

> changing the loaded tool set will break the model’s cache from that point forward.

因此，追加发现结果与重写旧的加载结果是不同操作。

### 3. 稳定的搜索与执行分发入口

宿主只暴露固定的搜索、描述、调用工具。模型先取得 schema 作为工具结果，再通过固定调用入口提交目标与参数。

原生 tools 前缀可以保持稳定；动态发现内容作为消息追加。但具体操作不一定享有原生工具级 schema 约束，参数验证、资源路由和错误反馈由宿主承担。

这是应用架构模式，不是 MCP 协议的缓存承诺，也不要求模型支持 tool_reference。工坊尚未决定采用此模式。

## 缓存边界

- 普通工具定义或靠前 system 改变，仍可能损失后续前缀复用。
- 修改过去的消息、定义或工具搜索结果，不等于只在尾部追加。
- 冷缓存、缓存有效期、前缀长度门槛、路由及 provider 实现都会影响实际命中。
- 命中缓存不代表定义不占模型上下文，也不代表后续工具选择没有成本。
- 已发现工具的存在，不应被用作资源授权；detach 后保留历史加载记录，执行层仍可拒绝目标资源访问。

## 对工坊的约束

1. 初版可保持已选工具目录稳定，资源 attach/detach 以消息事件表达。
2. 不把 MCP 延迟连接等同于模型侧工具延迟加载。
3. 内部事件与对象记录保持 provider 中立，由模型接入层生成对应消息和工具加载结构。
4. 使用原生工具搜索时，保留发现事件、定义版本与调用关系，保证历史可解释。
5. 工具发现不授予资源权限；执行层仍按轮次固定的有效授权校验。
6. 具体优化经实测再采纳，不因查到机制就改变初版稳定工具目录的约定。

## 建议的验证实验

对同一模型与短间隔连续请求比较：固定目录、普通 tools 增量、原生工具搜索、固定分发入口。记录完整输入量、缓存命中 token、延迟、工具调用正确率与执行权限结果。

保持其他条件一致，分别测试首次发现、追加新发现、资源解绑和改写旧工具定义，不能把一次请求的命中与否解释成通用保证。
