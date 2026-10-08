# 织台 · Weft

织台是一个以对象为中心的个人 agent 工作台。代理、资源与工具操作以可展开的卡片呈现，通过关系连接；任务的过程可以查看、分叉，并在资源支持时恢复状态。

它面向日常事务、信息收集、计算机维护，也包含编程，而不以代码仓库或聊天记录作为唯一的工作单位。

> 当前阶段：配置、单代理核心、首页发送与主代理对话视图已接通。可从首页创建真实会话，流式阅读 Markdown 回复，停止、继续、重开查看或从完整历史节点另起分支。模型添加和首页选择已由用户验证；真实对话与新界面待验收。工作台保留对象卡片和关系连线，真实对话位于主代理卡片内；正式资源与工具交互继续完善。当前工作见 [模型接入计划](plans/todo-2026-10-01-model-protocol-storage.md)。

## 核心约定

- **资源携带能力。** 目录资源提供文件工具，其他类型提供各自的操作。Workspace 的存储目录本身不自动提供工具或授权。
- **工具调用指向资源。** 调用显式携带资源身份；工具定义按类型共享，执行时检查目标与授权。
- **卡片是对象的视图。** 同一对象可以内嵌显示或独立展开；关闭卡片不等于删除对象。
- **工具过程默认收纳。** 工具调用默认是代理流里的一行状态，按需展开为卡片并显示输入、输出资源关系。
- **任务拥有时间线。** 历史查看不改变现实；资源的历史查看与状态恢复是两种独立能力。
- **变化保留过程。** attach/detach 以事件进入上下文，普通变更在执行轮次之间生效，运行期间显示 pending。
- **稳定上下文优先。** 初版采用稳定的工具目录与基础规则，资源变化进入消息事件；工具可见不等于资源可访问。

## 文档导航

| 文档 | 内容 |
| --- | --- |
| [产品定义](docs/product.md) | 目标、使用场景、范围与成功标准 |
| [词汇表](docs/glossary.md) | 产品词汇的中英对照与含义 |
| [对象模型](docs/object-model.md) | Workspace、Task、资源、操作、关系与视图 |
| [运行时与上下文](docs/runtime.md) | 执行轮次、资源绑定、工具、权限与模型输入 |
| [模型与代理配置](docs/model-configuration.md) | 提供商、模型角色、agent 配置及对话模型覆盖 |
| [时间线与恢复](docs/timeline.md) | 事件、检查点、历史查看、分叉、版本差异 |
| [工作台交互](docs/workbench.md) | 卡片、连线、执行段、时间导航与 pending |
| [技术架构](docs/architecture.md) | 桌面技术栈、进程职责、存储与扩展契约 |
| [实施路线](docs/roadmap.md) | 文档后的实现顺序与验收场景 |
| [决策与开放问题](docs/decisions.md) | 已定原则、初版取舍与需要验证的事项 |
| [MCP 缓存调研](docs/mcp-caching.md) | 延迟加载与提示缓存的机制与初版策略 |
| [模型与 Transcript 源码调研](docs/agent-transcript-research.md) | 开源项目的协议适配、消息组织、执行与持久化分工 |
| [立案任务](plans/) | 当前要做什么的唯一真值，完成归档 |

各文档生命周期与协作约定见 [AGENTS.md](AGENTS.md)。

## 技术基线

Electron、React、TypeScript、Vite、shadcn/ui + Tailwind CSS、@xyflow/react、Monaco Editor、SQLite（`node:sqlite`）、Zod；包管理器为 npm。代码构建为 electron-vite，打包分发为 Electron Forge。代理运行时置于独立 Node.js 进程。模型接入为 Vercel AI SDK，MCP 接入为官方 TypeScript SDK；二者不拥有任务历史，也不决定产品对象模型。测试以 macOS 为主，发布覆盖 macOS、Windows 与 Linux。

已安装版本见 `package-lock.json`。Monaco、模型 SDK 与 MCP SDK 在接入对应能力时安装。应用进程与存储约定见 `docs/architecture.md`。

## 开发

需要 Node.js 22.13+ 与 npm。首次安装依赖后启动桌面应用：

```bash
npm install
npm run dev
```

应用每次启动进入首页，不自动打开已有会话；侧栏可以隐藏，从列表明确选择后才读取对应工作台。首页可输入草稿并选择 agent、模型和思考等级；Enter 发送，Shift+Enter 换行。首次发送接受后创建会话并打开主代理，失败保留草稿。标题暂取首条输入，utility 异步命名留待后续，无需预先填写。

设置中的“提供商”管理连接与具体模型，“角色”管理五种内置及自定义模型角色，“代理”管理提示词、工具与委派等配置。角色与代理只保存用户覆盖，未填写的说明与提示词采用内置值；自定义项分别继承内置原始 default 与 worker，可恢复内置值后保存。旧完整配置升级时保留为显式覆盖，已有会话继续使用创建时配置。提供商支持 Responses、Chat Completions、Anthropic Messages，可保存后进行真实连接测试并取消；测试可能产生提供商费用。角色与代理的新编辑交互待 GUI 验收。

主代理视图展示流式 Markdown 正文、思考、工具过程与用量，可停止、继续和查看历史。重开从持久化记录恢复；不完整输出保留，可从之前完整位置另起分支。模型执行由独立任务进程承载，切换页面不停止执行。旧占位工作台不会自动转换为真实模型会话。

窗口采用系统材质底座，左上标题区、右上快捷操作与下方工作台之间留出间隙。macOS 使用原生 vibrancy；Windows 11 22H2+ 使用 Acrylic，其他平台/不支持场景使用实色回退。正式 bundle ID 为 `dev.dearain.weft`。窗口主进程配置变更后需要退出并重新 `npm run dev`，仅刷新页面不够；设计约定见 [界面设计系统](docs/design-system.md)。

检查与构建：

```bash
npm test
npm run typecheck
npm run build
```

`npm run package` 生成当前平台的未签名应用目录；`npm run make` 进一步生成 ZIP，均先构建代码。Forge 产物位于 `out/`，编译产物位于 `dist/`。macOS arm64 已做本地打包与内容检查；GUI 与其他平台需人工验收。

开发数据位于 Electron `appData/Weft-development`，发布版使用 `userData`；数据库为 `db/weft.sqlite`，正文在 `objects/`，运行时日志在 `logs/runtime.log`，Chromium 数据在 `chromium/`。重启会读取已保存的工作。当前没有后台常驻服务，关闭最后一个窗口会退出应用与任务进程。

模块入口见 [源码地图](src/README.md)、[界面维护](src/renderer/README.md)。跨平台与打包兼容性验收见 [桌面工程立案](plans/todo-2026-09-18-desktop-tooling.md)。

## 仓库范围

本仓库维护织台自身的源码和设计资料，不存放真实用户的会话、目录内容、凭据、浏览器资料或运行快照。应用数据目录与源码目录必须分离。
