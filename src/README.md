# 源码地图

这是正式桌面应用源码，不依赖固定场景或浏览器内存演示。架构契约见 [技术架构](../docs/architecture.md)，运行时与模型执行契约见 [运行时](../docs/runtime.md)。

| 目录 | 职责 | 依赖方向 |
| --- | --- | --- |
| `builtin-public.ts` / `builtin-runtime-public.ts` | 公共提供方版本与环境出口；后台领域实例单独绑定，前端不导入后台服务 | 内置公共 API、通用公共模块描述 |
| `shared/` | 版本化命令、工作台投影、传输信封与公共 schema（`i18n.ts`、`language.ts`、`provider-presets.ts`、`model-compatibility.ts` 等） | Zod、FormatJS 与 SDK 纯契约，不依赖任何进程或 UI |
| `main/` | Electron 窗口、平台材质、单实例锁、数据目录、运行时进程生命周期、可信 IPC 路由、`safeStorage` 加解密 | `shared`，不调用数据库 |
| `main/updates.ts` / `update-release.ts` | 更新偏好持久化、GitHub Release 候选选择、electron-updater 下载与设置页 IPC；安装由主进程退出流程收束后台后触发 | `shared/updates`、Electron、electron-updater |
| `preload/` | 沙箱桥，受控命令与状态订阅 | `shared`，只暴露 `window.host` |
| `runtime/` | 应用组合与会话列表；会话命令、历史查询、资源与布局、执行进度；SQLite、`objects/`、`content/` 存储与私有凭据客户端 | `shared`、`session`、`configuration`、内置实现后台入口、Node API |
| `storage/` / `runtime/prepare-data.ts` | 窗口前统一数据准备、JSON／SQLite 迁移链、文件备份、结果记录与恢复；主进程经独立准备进程调用 | Node API、各存储所属模块的声明；业务服务在准备完成后启动 |
| `runtime/templates.ts` | 静态工作台模板的保存、目录、实例化与删除；复用对象数据、资源身份、关系和内容依赖机制 | `shared/templates`、`session`、`resources`、运行时存储 |
| `configuration/` | 全局配置、密文凭据、插件提供商目录与共享账户查询、模型发现、参数获取、连接测试及默认角色（见 `configuration/README.md`） | `shared`、Node 文件系统、模型 SDK；不依赖 Electron 或数据库 |
| `session/` | 会话树存储（`session_nodes`）、当前时间线追加与游标选择、工作台存在性与链接重放 | `shared`、SDK 纯契约、Node SQLite；不依赖 UI 或插件运行时 |
| `model/` | 单次请求契约、文件输入检查、请求身份头、跨模型目标投影、思考等级／预算编码（`thinking-options.ts`）、思考续接中间件、请求接收计时与三协议 AI SDK 编解码 | `shared`、`session`、AI SDK |
| `execution/` | 单次模型请求与工具批次（`models.run`）、流块状态机、请求能力视图、工具策略、固定宿主入口与插件顶层工具调度 | `model`、`resources`、`tools`、存储格式 adapter |
| `resources/` | 资源身份生成（Nano ID）、后台契约、注册目录、卡片投影与环境聚合 | `shared`、`session` 对象类型 |
| `tools/` | 两层共用的工具定义投影、实现注册与产出校验、终结 `toModel` 投影、支持关系 | `shared`、`session` 对象类型 |
| `plugins/` | 包与公共模块图加载、配置／凭据托管、读取／执行门面、具型命令准备、插件调用与顶层工具、共享运行生命周期、瞬态事件路由与提交后派发 | `@atelier/sdk`、`session`、`resources`、`tools` |
| `../packages/builtin/` | 内置 `atelier.builtin` 插件的资源（`notes`、`filesystem`）、代理（`agent`）、会话命名（`naming`）与共享正文工具（见 `../packages/builtin/README.md`） | 后台/前端分入口；通过公开 SDK 消费宿主能力 |
| `../packages/builtin-api/` | 内置领域的公共资源、动作、记录、配置目录及作者示例 | SDK、Zod；不依赖内置实现或宿主 |
| `../packages/ui/` | 应用与内置插件共用的内部 UI 控件与展示 helper | React、SDK 展示接口与既有 UI 库；不访问宿主状态 |
| `renderer/` | 应用视图、浮岛编织、视图注册表、React Flow 工作台与用户意图（见 `renderer/README.md`） | `shared`、内置实现前端入口、React 与 UI 库；不访问 Node/数据库 |

## 核心调用路径

`renderer/features/session → preload → main/RuntimeHost → utilityProcess → SessionService → SessionTree / SessionWorkbench`

- **插件工具装配**：`plugins/loader.ts` 收集贡献、处理依赖与生命周期；`plugins/tool-contributions.ts` 校验插件内工具声明，并按用户列表解析覆盖与实现状态；`plugins/top-level-tools.ts` 绑定顶层工具调用上下文，`tools/registry.ts` 提供有效资源实现目录。覆盖契约见 [工具覆盖](../docs/runtime.md#工具覆盖)。
- **启动与插件构建**：主进程先调用 `prepare-data` 准备进程，完成存储迁移与校验后才读取偏好、创建窗口。`renderer/main.tsx` 承接后续启动阶段与数据恢复视图，后台就绪后装载 `renderer/application.tsx`；`plugins/build-cache.ts` 持有构建输入指纹与完整产物索引，`plugins/package-modules.ts` 在命中时跳过编译。契约见 [启动与加载](../docs/architecture.md#启动与加载)。
- **会话写入与观察**：会话命令经 Zod 校验后交运行时单一写入者同步事务处理。路径遍历位于 `shared/session-timeline.ts`（前后台共用）。`SessionTree.select` 将游标选择审计与游标更新原子提交；提交后分别派发新增记录观察 `committed` 与最终游标变化观察 `cursorChanged`（命名模块据此同步会话标题）。`SessionTree.workbench` 沿当前游标全量重放资源与链接事件，供工作台展示与执行校验共用。
- **代理执行循环**：`execution/request.ts` 完成单次补全及工具批次，`execution/response.ts` 维护该响应的临时流状态，终态内含于最高序号块交付。内置 Agent 由 `../packages/builtin/src/agent/runtime.ts` 装配：`selection.ts` 解析选择与工具策略，`admission.ts` 原子受理输入，`loop.ts` 驱动多轮请求，`compression.ts` 在请求间检查预算并生成摘要，`projection.ts` 负责响应分组、期间事件后置与上下文截取。在途输出经 `session.progress` 的 `live` 字段按 `objectId` 送达界面。
- **直连传输与插件事件**：renderer 经 `renderer/runtime.ts` 与任务进程 `runtime/connection.ts` 以 MessagePort 直连（协议见 `shared/connection.ts`），主进程只交接端口。全局具型瞬态事件由 `plugins/events.ts` 登记路由，前后台共用 `shared/event-queue.ts`（支持 `all` 与 `latest` 合并），经 `runtime/event-peer.ts → 直连 → shared/event-client.ts` 投递。Agent 经此发布 `ResourceStatusChanged` 供侧栏 `SessionStatus.tsx` 消费。高频对象数据经 `plugins/channels.ts` 的对象级双工通道传输，不进历史。
- **多语言目录**：语言偏好由 `main/language.ts` 管理（`language.json`）；插件静态翻译目录由 `plugins/catalogs.ts` 在启动时装载并随应用列表快照交付 renderer。源消息位于 `renderer/messages/` 与 `../packages/builtin/src/messages/` 与 `../packages/ui/src/messages/`，译文位于 `shared/locales/` 与 `../packages/builtin/src/locales/`。

## 开发与验证命令

- `npm run dev`：构建并运行 Electron，renderer 使用 Vite HMR。
- `npm run typecheck`：分别检查 Node 进程代码与 renderer。
- `npm test`：运行单元与契约测试（使用独立临时目录并自动清理，不访问真实应用数据目录）。
- `npm run build`：仅构建产物至 `dist/`。
- `npm run i18n:extract` / `npm run i18n:check`：FormatJS 消息抽取与 ICU／参数／覆盖率检查（支持在 `--` 后传外部插件包根）。
- `npm run package` / `npm run make`：通过 electron-builder 生成应用目录／安装与更新产物至 `out/`。

## 扩展入口

- **新增应用命令**：先在 `shared/` 定义命令与响应 schema，再在 `runtime/` 实现事务或查询，最后接入 `renderer/`。
- **新增资源与工具**：按 [功能模块指南](../packages/builtin/README.md) 添加 `contract.ts`、`runtime.ts` 与 `renderer.tsx`。
- **外部插件开发**：消费 [公开 SDK](../packages/sdk/README.md)，不依赖宿主内部控制器或物理节点表。
- **数据 schema 变更**：增加对应存储格式版本与连续迁移步骤，保留已发布的转换和旧格式夹具；实现入口见 [`storage/README.md`](storage/README.md)，契约见[数据准备与迁移](../docs/architecture.md#数据准备与迁移)。
