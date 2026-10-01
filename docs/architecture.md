# 技术架构

## 初版技术基线

| 领域 | 选择 | 说明 |
| --- | --- | --- |
| 桌面外壳 | Electron | 本地集成与统一 Chromium；测试以 macOS 为主，发布覆盖 macOS、Windows、Linux |
| 界面 | React + TypeScript + Vite | 交互面板与常规 Web 组件 |
| 设计系统 | shadcn/ui + Tailwind CSS | 组件源码纳入仓库；统一使用 Tailwind 与设计 token，不并行维护另一套组件样式体系 |
| 节点工作台 | @xyflow/react | DOM 卡片、端点与连线 |
| 文件编辑与 diff | Monaco Editor | 文件视图和差异视图，按需挂载 |
| 结构化持久化 | SQLite（`node:sqlite`） | 对象元数据、事件、关系、检查点索引；运行时未提供该模块或能力不足时改用 better-sqlite3 |
| 校验 | Zod | 事件、工具参数与配置的运行时校验；与 Vercel AI SDK 对齐 |
| 代码构建 | electron-vite | 主进程、preload、renderer 与任务运行时的开发与构建 |
| 打包分发 | Electron Forge | 跨平台打包；不与 electron-vite 叠加承担同一构建职责 |
| 大内容 | 本地对象文件存储 | 图片、资源快照和大段内容，不都塞入 UI 状态 |
| 任务运行时 | 独立 Node.js 进程 + TypeScript | 执行不依赖 React 生命周期，不阻塞主进程 |
| 模型接入 | Vercel AI SDK | 无状态适配：流式、工具调用、多 provider；不拥有任务历史 |
| MCP 接入 | 官方 MCP TypeScript SDK | 一种能力接入方式，不作为产品核心对象模型 |
| 包管理器 | npm | 不使用 bun 或 pnpm |

已安装版本见 `package-lock.json`：Electron 44.5.1、electron-vite 5.0.0、Forge 8.0.1、React 19.3.0、React Flow 12.12.0、Tailwind 4.3.3。Vite 锁定 7.3.6 以符合 electron-vite 的 peer 范围。shadcn/ui 控件采用 Radix UI，源码位于 `src/renderer/shared/ui/`；配置入口为 `components.json`。Monaco、模型 SDK、MCP SDK 随模块接入。

## 选型边界

- Electron 提供随应用分发的 Chromium 与 Node.js，优先保证复杂工作台的渲染一致性和本地 TypeScript 接入，不以最小安装包为首要目标。独立任务进程不等于工具执行沙箱。
- shadcn/ui 用于常规控件与卡片外壳，可复用 React Flow 的可选 UI 组件；产品对象模型不依赖组件库。
- React Flow 只维护节点、端点和连线的视图投影，不拥有对象、授权或任务历史。其核心不提供自动布局算法，布局引擎与手动位置保留策略须单独验证，见 [布局验证立案](../plans/todo-2026-09-18-workbench-layout.md)。
- Monaco 只在需要编辑或查看 diff 时挂载，不为每张文件卡片常驻编辑器。流式内容更新应局限于相关视图，不因每个文本增量重算整张画布布局。
- Vercel AI SDK 用于模型请求、流式响应和工具协议适配。可复用执行辅助能力，但所有工具执行仍经过织台的授权与事件记录；不引入另一套 agent 框架会话或检查点作为任务历史真值。
- 模型接入上层封装支持扩展协议；协议差异集中于适配边界。织台 transcript 的基础条目为 `message`、`thinking`、`toolcall`、`text`，后三类来自模型，按发生顺序平铺且支持类型扩展。轮次、请求、调用身份提供关联。能力层负责执行、错误、工具结果与实际模型输入，向界面提供查询、订阅和操作接口；界面独立决定展示与聚合。适配层构造目标协议要求的消息分组。具体契约见 [模型协议立案](../plans/todo-2026-10-01-model-protocol-storage.md)。
- electron-vite 负责代码构建，Electron Forge 负责打包分发；二者减少工程配置，不接管运行时职责。版本、进程入口与打包产物验证见 [工程工具立案](../plans/todo-2026-09-18-desktop-tooling.md)。

## 进程职责

### Renderer

卡片、连线、时间导航、编辑器、资源视图、输入与确认交互。通过受控 IPC 获取状态和发出意图，不直接访问任意文件或模型凭据。

### Electron 主进程

窗口、系统对话框、桌面集成、运行时进程生命周期与 IPC 路由，以及 Electron safeStorage 的凭据加解密。凭据服务通过进程间私有接口供运行时使用，不向 renderer 开放通用解密命令。避免承担模型循环和大规模资源操作。

### 任务运行时

任务事件、上下文构建、代理执行、资源与授权、工具调度、历史投影、恢复流程以及持久化。提供商配置、加密凭据文件与异步连接测试也由能力层管理；系统加解密由主进程提供。

独立进程不自动提供桌面应用退出后继续运行的能力。初版默认随应用关闭；持久后台服务需另行确认。

### 工程入口与生命周期

| 源码 | 构建产物 | 职责 |
| --- | --- | --- |
| `src/main/index.ts` | `dist/main/index.js` | 窗口、单实例锁、数据目录、IPC 信任检查 |
| `src/preload/index.ts` | `dist/preload/index.cjs` | 沙箱桥；仅暴露应用命令和状态订阅 |
| `src/runtime/index.ts` | `dist/main/runtime.js` | Electron utilityProcess 入口，拥有应用服务与数据库 |
| `src/renderer/main.tsx` | `dist/renderer/` | React 组合与工作台视图 |

main 与 runtime 使用 ESM；preload 使用独立 CJS bundle，第三方校验代码内联，适配 sandbox。运行时与主进程是同一 main 构建的两个入口，共享构建块保留相对路径。Forge 只打包 `dist/`、清单和生产依赖，不叠加 Vite 插件。包默认 ASAR，数据始终写到包外。

应用只接受同一窗口主 frame 的命令；禁止 renderer 任意 Node 调用、窗口跳转、webview 与新窗口。开发版仅为 Fast Refresh 的内联脚本放宽 CSP，发布版脚本只允许自身资源。preload、main、runtime 分别校验边界数据。

正式应用标识为 `dev.dearain.weft`：Forge 配置 `appBundleId`，Windows 设置 AppUserModelID。开发启动仍运行 Electron.app；此标识不决定应用数据库目录。

窗口外观独立于任务运行时：`window-appearance.ts` 配置平台材质、回退和系统偏好监听，`app/Window.tsx` 只组合标题栏与受管空间。macOS 使用 vibrancy；Windows 11 22H2+ 使用 Acrylic 与原生窗口控件覆盖；旧版 Windows/Linux 使用实色。preload 额外暴露只读平台标签，不开放窗口通用控制 API。窗口几何由 `src/shared/desktop.ts` 统一；细节见 `docs/design-system.md`。

任务进程启动就绪后才创建窗口。请求带协议版本与关联 ID，只发送一次；超时/退出使在途请求失败，不自动重放。退出时先要求任务进程关闭数据库，再等待退出；超时终止进程。初版关闭最后一个窗口即退出应用。任务进程崩溃后要求重启应用，不把进程重启当作未完成操作的重试。

应用命令与投影契约位于 `src/shared/contracts.ts`，协议版本为 1；它不依赖 Electron、React Flow 或 provider 类型。当前命令只覆盖真实实现的任务、代理、笔记、绑定、视图与历史查询。后续模型执行与资源操作通过运行时服务接入，不能在 renderer 中模拟执行或直写数据库。

## 建议的核心模块

| 模块 | 外部职责 |
| --- | --- |
| 任务历史 | 接受工作事件，提供指定历史位置的状态与分支；实现于 `src/history/` |
| 代理执行 | 执行轮次、pending 变化生效、模型与工具循环 |
| 资源能力 | 资源身份、生命周期、工具契约、视图与历史能力 |
| 工具调度 | 参数校验、授权检查、实际执行、结果和关系记录 |
| 模型接入 | 用 Vercel AI SDK 将内部上下文投影为 provider 请求及标准化响应 |
| 工作台投影 | 为 UI 提供卡片与关系数据，不把坐标作为业务事实 |

这是职责划分，不要求提前拆成多个包、服务或插件系统。先由目录资源与虚拟资源验证接口，再决定公共扩展面。

## 数据与事务

- 事件和相应元数据提交应有清晰事务边界。
- 数据库与外部副作用不构成天然的原子事务；记录操作开始、结果和未知状态，恢复时对账，不盲目重试。
- 大内容记录稳定引用及完整性信息；文件落盘与数据库索引需处理崩溃中间态。
- 历史快照、资源状态、配置与上下文投影需要可迁移的版本标识。
- 当前视图状态与业务事件分开。
- 事件表：`event_id`、`branch_id`、`seq`、`recorded_at`、`type`、`payload`；`UNIQUE (branch_id, seq)`。检查点格式未定。
- 应用数据位于 Electron `app.getPath('userData')` 的子目录，不写入源码仓库。SQLite 在 `db/`，大内容在 `objects/`，运行日志在 `logs/`，凭据在 `credentials/`。凭据与任务日志、事件记录分离。
- Chromium 的 cookie、缓存等会话数据使用独立的 `sessionData` 路径，不与应用数据混放。
- 不把 API key 写入事件或模型请求记录。完整请求留存与保留期限未定，不默认永久保存全部原始内容。

### 提供商配置约定（已定，待实现）

提供商连接属于本机应用级配置，可被不同任务引用；普通配置与凭据引用保存在 SQLite。首批接入 OpenAI Responses、OpenAI Chat Completions 与 Anthropic Messages，协议适配可扩展。配置可见性不构成资源授权。

API key 由主进程调用 safeStorage 加密，运行时保存密文至 `credentials/`；renderer 只读取凭据状态。加密不可用或 Linux 仅提供 `basic_text` 时不保存明文 key；解密失败时保留非秘密配置并要求重新填写凭据。开发与发布数据保持隔离。

连接测试采用可取消的异步任务，通过状态与结果通知返回，不让外部网络请求占用普通命令的超时等待。普通配置保存不触发外部请求。提供商存储表、模型 SDK 与凭据服务尚未实现，不属于下述存储版本 1；实施前置与字段细化见 [模型接入计划](../plans/todo-2026-10-01-model-protocol-storage.md)。

### 应用存储版本 1

`db/weft.sqlite` 使用 WAL、外键与 `PRAGMA user_version` 迁移；发现更高版本时拒绝打开，不静默降级。任务进程是应用数据的单一写入者，主进程单实例锁阻止重复实例。

- `events` 沿用历史内核的只追加记录；创建事件可带 `title`，笔记创建事件可带 `content_ref`。可选字段兼容旧的历史内核记录。
- `workspace` 保存本地工作区身份与名称；`tasks` 保存任务查询索引。每个新任务创建一个初始分支。
- `object_views` 保存当前卡片位置、隐藏和折叠状态；`viewports` 保存每个任务当前视口。两者不追加工作事件，也不声称重建历史布局。
- 应用元数据与相应事件处于同一 SQLite 事务；历史内核用保存点嵌入外层事务。
- `objects/<sha256>` 保存不可变 UTF-8 正文。先通过临时文件写入、刷新与重命名完成内容，再提交事件引用；文件系统与数据库没有跨介质原子事务，失败可能留下无引用对象。读取校验 hash，丢失或不匹配时报告内容不可用。无引用对象回收与更强的崩溃对账见后续立案。

笔记初版仅支持创建和读取。历史查看读已保存的正文引用，不代入当前内容；笔记不声明状态恢复能力。目录资源、资源修改版本和检查点仍按各自契约实施。开发数据根为 `appData/Weft-development`，`sessionData` 单独放在该根的 `chromium/`。

## 资源扩展契约

一个资源类型实现运行时操作、所需权限、视图描述以及历史能力。不同类型共享生命周期与调用约定，但不强求共享内部存储或恢复实现。

不以通用 extractTool 字符串猜测替代可靠的对象关系信息。原生实现输出结构化关系；MCP 接入可补充适配，无法判断时明确未知。

## 安全边界

- Renderer 不开放通用 Node 执行，不接受任意 IPC 方法与参数。
- 网络内容与用户文件按不可信数据处理，不直接执行其中的脚本或指令。
- 资源引用不构成授权；授权在运行时工具执行层落实。
- 凭据与任务日志分离，不把 API key 序列化进事件或模型请求记录。
- 目录资源需要真实路径与文件访问约束；未来 shell 等能力另行设计隔离。
- 用户的运行数据不写入源码仓库。

## 非目标

不实现浏览器引擎、通用绘图引擎或插件市场；不把任务历史托付给聊天或 agent 框架；不为了统一而提前建立通用 DSL。
