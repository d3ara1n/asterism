# 内置插件实现（`@atelier/builtin`）

内置 Agent、问答、笔记、目录、命名与设置组成插件 `atelier.builtin`。实现通过 `@atelier/sdk` 使用宿主能力，通过 `@atelier/builtin-api/contracts` 消费公共领域契约，基础控件来自内部 `@atelier/ui`。本包不反向导入应用 `src/` 的生产代码；测试可复用宿主集成设施。

## 应用组合入口

- `@atelier/builtin/runtime`：`createBuiltin({ application, connectNaming })` 返回插件定义；应用显式传入展示名称、请求 User-Agent，并连接命名接口。`createSelection`、`composeSystemPrompt` 为首页首次提交提供与 Agent 相同的领域准备规则。
- `@atelier/builtin/renderer`：`builtinRenderer` 聚合功能视图 `builtinViews` 与设置页；另提供 `BuiltinRendererProvider` 及首页复用的输入草稿、文件输入、模型选择和提交身份工具。应用通过 provider 注入按插件绑定的偏好门面，供 Agent 扩展组件使用。
- `@atelier/builtin/locales/zh-Hans.json`：由应用装配的内置翻译目录。

`agent/renderer.tsx` 同步登记配置与上下文工具栏项；`agent/feedback-renderer.tsx` 作为独立模块订阅执行反馈，由插件入口显式组合，订阅的准备与清理作用域独立于视图登记。

宿主加载、外部插件依赖、公共提供方登记与关闭协调留在应用组合层。外部插件使用 [公共 API 包](../builtin-api/README.md)，不依赖实现包。

## 功能目录

| 目录 | 职责 |
| --- | --- |
| `src/agent/` | 选择、输入受理、执行循环、上下文压缩、历史投影与对话视图；`data.ts` 保存私有状态，`submissions.ts` 按提交身份去重，`drafts.ts / drafts-contract.ts` 管理持久输入调度与内部草稿动作，公共动作与记录在公共 API 包 |
| `src/agent/peek/` | Agent 资源的只读调查工具、时间线记录快照、内部检索与 utility 流式报告；报告视图复用对话折叠外壳与思考预览 |
| `src/agent/send/` | 共享 `Send` 工具的 Agent 实现与三态视图；通过资源身份直接发送、从调用者上下文填写来源并复用 `SubmitAgentInput` |
| `src/agent/ui/` | Agent 自有 toolbar／overlay／modal 布局、贡献组件挂载、当前模型选择注入与输入区隐藏请求；公共作者接口在 `@atelier/builtin-api/renderer`，内置工具栏贡献在 `conversation/Toolbar.tsx` |
| `src/agent/conversation/Markdown.tsx`、`MarkdownCode.tsx`、`MermaidDiagram.tsx` | Markdown 图片与代码组件、Mermaid 按需渲染；`markdown-options.ts` 声明历史与实时内容共用的插件，交互见[对话视图](../../docs/workbench.md#代理卡片与工具调用视图) |
| `src/questions/` | `ask_user` 三题型与结构化答案、内存问答服务及具型调用、可保留草稿的底部／模态作答界面和工具三态视图；契约见[等待用户回答](../../docs/runtime.md#等待用户回答)，交互见[结构化问答](../../docs/workbench.md#结构化问答) |
| `src/notes/`、`src/filesystem/` | 资源与正文工具实现、创建入口与三态工具视图 |
| `src/shell/` | Shell profile、非交互管道进程、显式终止与 IO 收束、有界输出及临时日志；目录 `exec` 经同一服务执行，契约见 [目录命令执行](../../docs/runtime.md#目录命令执行exec) |
| `src/resources/` | Agent 创建目录查询、创建和统一移除顶层工具及三态视图；通过 SDK 绑定会话门面消费宿主生命周期 |
| `src/naming/` | 自动命名、人工命名接口和标题投影；记录契约由公共包提供 |
| `src/settings/` | 内置插件托管配置与按流式预览／Shell 分组的自定义设置页；配置在插件根入口登记 |
| `src/providers/` | 提供商预设、主动余额／套餐查询及 `headers.ts` 的被动限流解析；各服务独立解析，主动 HTTP 共用 `usage-http.ts`，通过 SDK 贡献登记，不拥有缓存或跨进程消费 |
| `src/usage/` | 独立的账户用量消费者：从 SDK 目录取实现，管理缓存、解析 Agent 显式交付的响应结果，通过自有调用／事件向共享订阅和 toolbar 交付状态；不导入提供方实现 |
| `src/shared/` | 正文算法、共享工具声明、预览规则、公共流式开合状态机与创建表单 |
| `src/messages/`、`src/locales/` | 内置插件自有文案与翻译 |

功能按契约、后台、前端分入口，不建立同时加载 Node 与 React 实现的 barrel。工具作者的参数说明、错误自愈与 `toModel` 规则见 [运行时](../../docs/runtime.md#原生正文工具与目录操作)；代码编写时 args、target、result schema 必须有完整描述，错误须区分失败、取消与无法确认写入影响。

模型提示块的通用序列化属于宿主模型适配层；Agent 只组合领域提示内容。命名、压缩与执行请求的应用身份通过工厂参数传入，不读取应用 package.json。

流式正文统一使用 `@atelier/ui/streaming-preview` 的 `StreamingPreview`，调用方提供正文渲染；预览阶段通过 `shared/streaming-disclosure.ts` 消费同一对设置。内置工具的首段执行产出由 `agent/conversation/tool-output.ts` 识别，输入预览沿用 `tool-state.ts`。交互与呈现分别见 [工具调用三态视图](../../docs/workbench.md#工具调用三态视图) 和 [对话过程视图](../../docs/design-system.md#对话过程视图)。
