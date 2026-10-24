# 技术架构

## 技术基线

| 领域 | 选择 | 说明 |
| --- | --- | --- |
| 桌面外壳 | Electron | 本地集成与统一 Chromium；测试以 macOS 为主，发布覆盖 macOS、Windows、Linux |
| 界面 | React + TypeScript + Vite | 交互面板与常规 Web 组件 |
| 对话渲染 | LobeHub Streamdown（`@lobehub/streamdown`） | Markdown、GFM、流式未闭合语法与平滑渐入，应用不自建解析器或动画队列 |
| 设计系统 | shadcn/ui（Radix）+ Tailwind CSS | 组件源码纳入仓库；统一使用 Tailwind 与设计 token，不并行维护另一套组件样式体系 |
| 节点工作台 | @xyflow/react | DOM 卡片、端点与连线的视图投影，不拥有业务对象、授权或历史 |
| 代码与差异展示 | Pierre Diffs（`@pierre/diffs`） | 代码语法着色与 stacked unified diff 视图，按需渲染 |
| Markdown 富内容 | remark-math、rehype-katex、KaTeX、Mermaid | 标准数学语法与 Mermaid 图形；通过渲染器公开插件和组件入口接入 |
| 文本差异生成 | diff（jsdiff） | 后端按行生成标准 unified diff，保留换行差异并限制计算预算 |
| 结构化持久化 | SQLite（`node:sqlite`） | 工作区身份、会话节点树、当前数据、内容依赖索引与视图布局 |
| 校验 | Zod | 事件、工具参数、IPC 与配置的运行时校验 |
| 代码构建 | electron-vite | 主进程、preload、renderer 与任务运行时的开发与构建 |
| 打包分发 | Electron Forge | 跨平台打包；只打包 `dist/`、清单和生产依赖，不叠加 Vite 插件 |
| 大内容 | 本地对象文件存储 | 宿主正文（`objects/`）与插件不可变字节内容（`content/`） |
| 任务运行时 | 独立 Node.js 进程（utilityProcess） | 执行不依赖 React 生命周期，不阻塞主进程 |
| 模型接入 | Vercel AI SDK | 无状态适配：流式、工具调用、多 provider；不拥有任务历史 |
| 国际化 | FormatJS（`@formatjs/intl` / `react-intl`） | ICU MessageFormat 格式化、语言匹配与 CLI 抽取（见 [公共 i18n](i18n.md)） |
| MCP 接入 | 官方 MCP TypeScript SDK | 一种能力接入方式，不作为产品核心对象模型（待接入） |
| 包管理器 | npm | 不使用 bun 或 pnpm；已安装版本以 `package-lock.json` 为唯一真值 |

## 进程职责与工程入口

| 源码 | 构建产物 | 职责 |
| --- | --- | --- |
| `src/main/index.ts` | `dist/main/index.js` | 窗口、平台材质、单实例锁、数据目录、任务进程监护、直连端口交接、退出确认、Electron `safeStorage` 凭据加解密 |
| `src/preload/index.ts` | `dist/preload/index.cjs` | 沙箱桥（独立 CJS bundle，校验代码内联）；`window.host` 只暴露主进程能力，并把任务进程直连端口转交页面 |
| `src/runtime/index.ts` | `dist/main/runtime.js` | Electron `utilityProcess` 入口，拥有应用服务、SQLite 数据库、模型循环、工具调度与插件宿主 |
| `src/renderer/main.tsx` | `dist/renderer/` | React 组合、工作台视图与用户意图，不直接访问任意文件或凭据 |

- **应用标识與数据根**：正式标识固定为 `dev.dearain.atelier`（集中于 `src/shared/application.ts`，内部契约与通道通过 `src/shared/core.ts` 生成 `core.* / core:*`）。应用数据统一位于 Electron `app.getPath('userData')` 下：发布版为 `appData/dev.dearain.atelier`，开发版为 `appData/dev.dearain.atelier-development`，在获取单实例锁前创建并显式设置，不写入源码仓库或安装目录。
- **进程生命周期**：任务进程启动就绪后才创建窗口。主进程与任务进程之间保留控制链路（就绪、退出确认读取、关闭与凭据请求），请求带协议版本与关联 ID，只发送一次，超时或退出使在途请求失败，不自动重放。renderer 业务流量走直连端口，见 [直连传输](#直连传输)。关闭最后一个窗口时先要求任务进程关闭数据库再退出应用；任务进程崩溃后要求重启应用。
- **启动环境**：主进程在 fork 任务进程前以 `shell-env` 读取用户登录 shell 的环境并写回 `process.env`（Windows 原样保留）。从 Finder／Dock 启动的应用由此取得与终端一致的 PATH 等变量；任务进程及其派生的 shell、终端、MCP 与插件子进程继承同一份环境，插件无需另行解析。解析失败时沿用原环境并记录日志。
- **凭据隔离**：凭据加解密由主进程调用 `safeStorage` 提供私有接口供任务运行时使用，不向 renderer 开放解密命令。加密不可用或 Linux 仅提供 `basic_text` 时拒绝保存明文 key。

## 应用组合与宿主机制

Atelier 分为**应用组合层**、**通用宿主机制**与**插件**三层：

- **应用组合层**：将宿主能力与随软件分发的内置插件（`atelier.builtin`）组成产品功能（例如首页创建 Agent 并提交首条输入、人工命名入口调用 `NamingApi.nameByUser`）。
- **通用宿主机制**：负责事务、记录存储、执行游标、路由、校验与运行生命周期，不解释 Agent 消息、回合或命名来源等插件领域语义。
- **插件业务层**：内置 `atelier.builtin` 与外部插件使用同一个 `@atelier/sdk`（见 [插件 SDK](plugin-sdk.md)），不因随软件分发获得绕过身份、校验或生命周期的特权。

源码依赖方向为：**应用组合层 → 宿主接口 + 内置插件公开领域接口 + SDK**；**通用宿主机制 → SDK**；**内置实现 → SDK + 内置公共 API + 内部 UI**；**外部插件 → SDK + 已声明的公共包**；**公共 API → SDK**；**SDK 不依赖任何实现**。公开导入只建立代码依赖，记录写入仍经具身份的操作柄打戳与校验。

内置 `shell/` 模块实现 shell profile、管道进程句柄、输出处理与清理，目录工具是消费入口。等待退出与显式终止分开，单次 `exec` 自行绑定期限与取消，其收束由宿主管理。具体规则见 [目录命令执行](runtime.md#目录命令执行exec)。

内置 `terminal/` 模块复用 shell 配置解析，以 `node-pty` 持有交互式外部进程，`@xterm/headless` 持有屏幕状态，前端 `@xterm/xterm`（WebGL 渲染，上下文不可用时回退 DOM）展示并接收用户输入。屏幕、输入与实例状态经对象级双工通道传输；模块通过资源存在性观察和关闭回调管理实例，不由通用宿主解释终端状态。模型图片通过模块级前端服务绘制已捕获网格，后台以内容引用交付。原生依赖和辅助程序随应用打包到 asar 外；macOS 预编译辅助程序的执行权限由项目安装步骤设置。完整行为见 [终端资源](runtime.md#终端资源)。

内置实现位于 `packages/builtin/`，公开领域声明位于 `packages/builtin-api/`，应用与内置界面共享控件位于内部 `packages/ui/`。内置后台与前端保持静态构建，应用组合层通过包入口安装内置插件并登记公共提供方；通用加载器只消费提供方描述，不导入 Agent。公共实例、依赖及版本规则见 [公共模块与契约身份](plugin-sdk.md#公共模块与契约身份)。外部插件包在启动时由宿主打包并缓存于 `<data>/plugins/.cache`，前端静态资源经 `atelier-plugin://` 只读提供，高频数据经 [对象级双工通道](plugin-sdk.md#对象级双工通道api-150) 传输。

## 存储归属与数据事务

| 路径 | 内容 | 管理方 |
| --- | --- | --- |
| `configuration.json` | 模型提供商与网络提供商连接、具体模型、模型角色与代理配置（角色与代理只存用户覆盖），原子临时文件重命名保存 | 运行时配置模块 |
| `appearance.json` | 外观主题与过程视图自动开合偏好 | 主进程，`electron-store` |
| `language.json` | 界面语言偏好 `preference`（`system` 或 BCP47 标签） | 主进程，`electron-store` |
| `ui-state.json` | 窗口位置/尺寸与受控 `preferences` 容器（`creation-route/` 路由记忆与 `plugin/<pluginId>/` 插件偏好） | 主进程，`electron-store` |
| `credentials/` | `safeStorage` 加密密文；配置文件只保存引用 | 运行时凭据模块 + 主进程加解密 |
| `db/workspace.sqlite` | 工作区身份、会话树节点、当前会话/对象数据、模板、内容依赖索引与工作台视图布局 | 任务运行时 |
| `content/` | 插件不可变字节内容（`temporary/` 暂存，`sealed/<id>` 封存，见 [不可变内容](content.md)） | 任务运行时 |
| `extensions/<pluginId>/` | 插件自管文件与数据；其中 `.atelier/` 保留给按需选用的托管配置、数据库与凭据引用，使用规则见 [插件 SDK](plugin-sdk.md#插件配置与界面本地化) | 插件与运行时托管设施 |
| `logs/runtime.log` | 运行时正式英文日志 | 任务运行时 |
| `chromium/` | cookie、缓存等独立 `sessionData` | Electron |

全局配置独立于会话数据库生命周期，重建 `workspace.sqlite` 不重置全局配置。开发前期只支持当前存储 schema 与配置文件格式版本（定义于源码常量），不提供旧数据迁移；版本不符时明确报错并保留原文件。插件领域数据由所属契约的 schema 解码判断兼容性，迁移归插件负责。

### 工作数据库（`workspace.sqlite`）表职责

数据库开启 WAL 与外键，由任务运行时单实例独占写入：
- `workspace` / `sessions`：本地工作区身份与会话查询索引（含当前 `cursor`、`title` 与归档时间 `archived_at`）。会话的全部关联表以 `ON DELETE CASCADE` 引用 `sessions`，删除会话即整体删除其历史、游标选择日志、当前数据、布局与内容依赖根。
- `session_nodes`：保存全部不可变历史节点（`seq`、`id`、`session_id`、`parent_id`、JSON `payload` 及虚拟生成列 `contract`）。载荷含宿主写入的 `source: { plugin, resource } | null`、契约身份与数据；宿主不为特定执行体的输出建列或约束。
- `cursor_selections`：显式执行游标选择的追加审计日志，与 `sessions.cursor` 更新处于同一事务；不进入会话树或模型上下文。
- `session_data`：保存当前会话或对象数据，以 `(session_id, object_id, contract_id)` 定位（空 `object_id` 表示会话级，如笔记正文存对象级 `atelier.builtin/note.content`）。纯数据保存可与事件同事务提交，只通知视图、不追加历史，回溯或分叉不恢复当前值。
- `contents` / `content_roots`：不可变内容元数据及记录／当前数据的引用依赖根（见 [不可变内容](content.md)）。
- `object_views` / `viewports`：当前卡片位置、隐藏、折叠、宽高覆盖与会话画布视口；独立于任务历史。
- `templates`：静态模板记录，名称与创建时间独立列出，JSON 保存对象数据与关系；目录查询只投影对象类型和标题，不交付对象正文。语义见 [工作台模板](object-model.md#工作台模板资源数据与关系)。
- `template_content_roots`：模板的不可变内容依赖，与会话级内容根共同参与回收，见 [不可变内容](content.md)。

**启动清理**：开库后、构造会话服务之前，删除归档时间早于冷静期的会话（级联删除关联行）；随后内容存储构造时回收失去依赖根的内容与暂存文件。清理集中在启动期执行一次，运行期不定时扫描。插件自管的按会话数据由插件对照会话目录自行清理，见 [插件 SDK](plugin-sdk.md#会话目录与资源操作api-91)。

业务提交中的应用元数据与事件处于同一 SQLite 事务，历史内核用保存点嵌入外层事务；游标观察者重建的标题等派生当前值在原提交后排队写入。数据库与外部文件系统没有跨介质原子事务，文件写入语义见 [运行时](runtime.md#原生正文工具与目录操作)。

## 会话与前端能力接口

### 直连传输

renderer 与任务进程经一对 `MessagePort` 直连（`src/shared/connection.ts`）。页面注册接收监听后调用 `window.host.connectRuntime()`，主进程只受理受信主框架的首次请求，以 `MessageChannelMain` 建立端口对，一端交给任务进程，另一端经 preload 原样转交页面；任务进程不可用时转交不带端口的消息。之后主进程不转发任何业务消息。

- **信任边界**：来源校验只在交接端口时进行一次；端口只交给受信窗口的主框架，每个页面只受理一次请求。
- **校验与编码**：两端由同一构建产出，帧形状以类型约束。任务进程入口按领域命令解析一次（会话、配置、内容等领域服务各自的 schema），推送帧由受信的任务进程构造，接收端不逐帧校验；载荷以结构化克隆传递，不经 JSON 编码。
- **多路复用**：一条连接承载请求／回执（`workspace / session / configuration / plugin-configuration / content`）、会话与配置变化推送、插件事件、具型调用与对象通道。
- **连接寿命**：页面刷新、跳转或渲染进程退出时主进程通知任务进程结束该连接；连接结束取消其事件订阅、调用处理与对象通道，并释放内容传输状态。运行状态变为不可用或停止时 renderer 端结算在途请求。直连请求不设单次等待期限（会话命令可合法地长时间运行）；任务进程卡死由主进程心跳判定：就绪后每 5 秒 ping，15 秒内没有 pong 即结束任务进程并通知 unavailable。

### 能力通道

主进程能力经 `window.host`（窗口、外观、语言、偏好、系统对话框、本机文件打开与运行状态）；任务进程能力经直连客户端（`src/renderer/runtime.ts`）：
- **应用列表（`src/shared/contracts.ts`）**：提供工作区身份、会话列表摘要与启动时装载的插件静态翻译目录，不持有已打开会话的正文。
- **桌面窗口（`window.host.window`，`src/shared/desktop.ts`）**：由主进程提供只读窗口状态及变更订阅，不进入任务运行时；布局规则见 [原生窗口与 Web 内容](design-system.md#原生窗口与-web-内容)。
- **本机文件打开（`core:open-local-file`）**：受信主 frame 通过 preload 提交绝对路径，主进程调用系统关联应用打开并返回错误文字；不读取文件内容、不进入任务运行时。内置插件前端通过应用组合注入的方法消费，网页链接继续只接受 HTTP(S)。
- **全局配置（`src/shared/configuration.ts`）** 与 **插件配置**：分别管理模型提供商／网络提供商／角色／代理配置（含插件提供的预设与用量目录、模型发现、参数获取与异步连接测试）及插件 `.atelier/config.json`；读写不触发工作台重载。用量结果由消费插件通过具型调用和事件交付自己的界面；后台目录及凭据边界见 [插件 SDK](plugin-sdk.md#提供商与用量目录api-100)。
- **插件调用（`src/shared/plugin-calls.ts`）**：独立传递具型请求、结果与取消；不占用会话命令队列。业务契约与生命周期见 [具型插件调用](plugin-sdk.md#具型插件调用)。
- **对象通道**：按对象打开的双工消息流，宿主校验对象位于当前路径并路由到所属插件；接口见 [对象级双工通道](plugin-sdk.md#对象级双工通道api-150)。
- **会话（`src/shared/session.ts` / `workbench.ts`）**：统一处理会话生命周期、资源创建与动作、工作台关系与视图布局：

| 命令 | 行为 |
| --- | --- |
| `start` | 显式 agent 配置，模型与 thinking 可为 null 并在请求时继承；原子保存 Session、首个代理、首条输入并开始执行 |
| `template.source / template.save` | 读取当前对象摘要／保存所选对象数据与关系为模板 |
| `template.start / template.delete` | 原子从模板创建新会话／删除模板及其内容依赖根 |
| `resource.command` | 路由到对象所属资源控制器（如内置代理的 `submit`、`continue`、`configure`、`cancel`） |
| `resource.create` | 由资源模块校验输入并原子提交对象创建事件、资源初始数据与初始视图布局 |
| `read` | 同次读取返回会话树、执行游标、工作台投影和当前进度，不接受独立历史位置参数 |
| `watch` / `unwatch` | 打开／关闭当前会话数据订阅；初始数据与后续变化经同一通道按序交付 |
| `select` | 会话所有被捕获资源均 settled 时移动执行游标，同事务记录 `cursor_selections` |
| `disposal.warnings` | 按对象 ID 读取资源当前的结束提示；移除、回溯确认框在打开时查询，不进入工作台投影 |
| `object.remove` | 对象 settled 后移除，并解除全部入向、出向链接；未收束时返回 `conflict` |
| `link.set` | 变更指定会话的资源有向链接，事务提交后通知 |
| `view.set` / `viewport.set` | 保存卡片布局（位置、折叠、隐藏、尺寸覆盖）或画布视口，不修改历史 |
| `rename` | 调用命名模块追加 `source: user` 的 `SessionNamed` 事件并同步标题 |

前端的资源创建、链接与移除和后台 SDK 使用同一宿主操作，统一完成身份、事务与收束检查；后台接口见 [会话目录与资源操作](plugin-sdk.md#会话目录与资源操作api-91)。

### 状态协调与流式进度衔接

- **动作与显示分离**：命令完成后返回 `accepted` 与会话身份，普通动作不触发读取或等待同步；`start / submit` 以 `submissionId` 保证幂等重试，同 ID 沿用已受理结果。入口用 pending 禁止重入，异步订阅与读取沿挂载生命周期取消。真实写入仍由后台按资源处理，当前数据更新独立交付。
- **当前数据与按序更新**：前端先订阅会话通道，再以 `watch` 打开；后台同步交付一次 `session.opened` 当前数据，之后 `session.changed` 直接携带新增记录、当前游标／标题和发生变化的资源投影。结构变化与回溯交付当前工作台，布局修改只交付布局。普通资源数据写入不读取或传输历史；资源身份按稳定创建记录定位并复用。最后一个查看者离开后 `unwatch` 停止推送，重开重新取得当前数据。
- **流式进度**：`session.progress` 与初始数据、记录追加使用同一后台出口按发生顺序投递，携带资源占用 `busyObjectIds`、创建占用 `timelineBusy` 与 `live` 增量。增量相对上一次交付按块 ID 对齐（`src/shared/live-patch.ts`）：新块整块发送；块内按 JSON 路径比较，字符串只追加时发送尾部，数组增长时只发送新元素，对象按键比较，其余变化在最深的变化位置整值替换（含工具执行中的 `result`），未变化的块与字段不出现；`null` 表示流式正文未变化。输入阶段的工具调用只传 `argumentsText`，`arguments` 为 null；宿主前端按块宽容解析（`src/shared/partial-arguments.ts`，`partial-json`，不接受 NaN／Infinity）补回预览参数后交给插件，进入 ready 后采用后台的完整参数。后台同一解析只用于调用身份。接收端从 `session.opened` 的完整列表开始依次应用，未变化的块保持对象身份。记录提交先交付，随后移除对应流式块；展示身份使用 `responseId + ordinal`，流式生成与落库保持同一组件。占用语义见 [宿主运行生命周期](plugin-sdk.md#宿主运行生命周期)。

## 安全边界与非目标

- 应用只接受同一窗口主 frame 的命令；禁止 renderer 任意 Node 调用、窗口跳转、webview 与新窗口。网页链接经 HTTP(S) 检查后交系统浏览器打开。
- 浏览器权限检查与请求共用受信窗口、主 frame 和页面 URL 校验，只允许本机字体枚举与剪贴板写入；不授予剪贴板读取或其他浏览器权限。
- 开发版仅为 Fast Refresh 放宽内联脚本 CSP，发布版脚本只允许自身资源与已登记插件资源；图片允许受控内容 URL 和 HTTP(S) 来源，Markdown 图片不发送 referrer，文件路径不构成内容读取授权。其余网络连接与脚本来源不随图片放宽。preload 与 main 校验主进程能力的边界数据，任务进程入口校验直连命令。
- 数学排版使用 KaTeX 的非信任模式；Mermaid 通过官方 `render` 与 `securityLevel: strict` 生成清理后的 SVG，不执行模型正文中的 HTML 或脚本。
- 网络内容与用户文件按不可信数据处理，不直接执行其中的脚本或指令。
- **授权是上下文边界，不是安全边界**：资源链接与执行层授权决定模型在一次请求中可见、可操作的对象集合，用于控制上下文规模与引用精度；资源引用与 UI 可见性不构成授权，授权在运行时工具执行层落实。工坊不提供权限模型，也不审计代理行为：shell、终端与 MCP 服务器以当前系统用户的能力运行，用户通过链接、工具策略与模块设置（如停用 MCP 服务器）决定代理可用的能力。独立任务进程与目录真实路径校验不构成操作系统级沙箱。
- 凭据与任务日志、事件记录分离，不把 API key 序列化进事件或模型请求记录。
- **非目标**：不实现浏览器引擎、通用绘图引擎或插件市场；不把任务历史托付给聊天或 agent 框架；不为了统一而提前建立通用 DSL。
