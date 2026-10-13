# 源码地图

这是正式桌面应用，不依赖固定场景或浏览器内存演示。

首页、侧栏与三类真实配置已实现并验收。提供商保存/测试、模型角色和 agent 配置能力见 `configuration/README.md`；单代理核心与会话 IPC 已实现，契约见 [会话与单代理能力](../docs/conversation-core.md)，首页发送与代理对话视图已消费会话接口，真实端点与 GUI 验收按 [模型接入计划](../plans/todo-2026-10-01-model-protocol-storage.md) 推进。

| 目录 | 职责 | 依赖方向 |
| --- | --- | --- |
| `shared/` | 版本化命令、投影与传输校验 | Zod 与 SDK 纯契约，不依赖任何进程或 UI |
| `shared/i18n.ts`、`shared/language.ts` | FormatJS 消息格式化、语言匹配与展示传输；不读写业务数据 | FormatJS 与 SDK 纯契约 |
| `main/` | Electron 窗口、单实例锁、数据目录、运行时生命周期、可信 IPC 路由 | shared，不调用数据库 |
| `preload/` | 沙箱桥，受控命令与状态订阅 | shared，只暴露 `window.host` |
| `runtime/` | 应用组合与列表；会话命令、历史查询、资源与布局、执行进度；SQLite、对象存储与私有凭据客户端 | shared、session、configuration、modules 后台入口、Node API |
| `runtime/content-store.ts`、`runtime/content-transfer.ts` | 不可变字节、临时占用与持久依赖；桌面分块传输和读取占用 | SDK 内容契约、SQLite、Node 文件系统；不解释领域格式 |
| `configuration/` | 全局配置 JSON、密文凭据、连接测试与默认角色，见目录 README | shared、Node 文件系统、模型 SDK；不依赖 Electron 或数据库 |
| `session/` | 会话级扁平树、游标与吸附、模型投影、工作台折叠 | shared、SDK 纯契约、Node SQLite；不依赖 UI 或插件运行时 |
| `model/` | 单次请求契约、文件输入检查与解析、三协议 SDK 适配与续接资料 | shared、session、AI SDK |
| `execution/` | 单次模型请求与工具批次、流块状态机、请求能力视图、外部工具策略与固定宿主操作入口；外层循环归插件 Agent | model、resources、tools、存储格式 adapter |
| `resources/` | 资源身份生成、后台契约、注册目录、卡片投影与环境聚合 | shared、session 对象类型、Nano ID |
| `tools/` | 两层共用的工具定义投影、实现注册与产出校验、终结模型投影、支持关系；不持有外部授权策略 | shared、session 对象类型 |
| `plugins/` | 包与公共模块图加载、配置／凭据托管、读取／执行门面、具型命令校验、共享运行生命周期、资源／工具适配、core 存储与目录适配、提交后派发 | SDK、session、resources、tools |
| `modules/` | core 的资源、代理、命名与视图；`modules/shared/` 承接共享工具契约、正文算法与前端预览投影，见目录 README | 后台/前端分入口；宿主能力通过公开 SDK 消费，公共视觉复用 renderer/shared |
| `renderer/` | 应用视图、视图注册机制、React Flow、用户意图 | shared、modules 前端入口、React 与 UI 库；不访问 Node/数据库 |

## 完整路径

`renderer/features/session → preload → main/RuntimeHost → utilityProcess → SessionService → SessionTree / SessionWorkbench / ObjectStore`

会话命令先由 Zod 校验，再交运行时单一写入者处理。业务创建、查询索引与初始视图处于同一事务；正文引用只在内容文件成功落盘后进入事件。命令返回受理结果，读取返回指定位置的会话树与工作台投影，UI 将其映射为画布和代理对话。

路径遍历位于 `shared/session-path.ts`，运行时与 renderer 共用；所有入树记录均推进游标且可查看，宿主不判断续接点。会话节点是通用记录（契约、来源、载荷、模型可见文本、接收者），宿主不解释载荷。`execution/request.ts` 完成一次补全及工具批次，`execution/response.ts` 只持有该响应的临时流状态；正文在终态到达后交付，工具块在取得结局后交付；终态内含于最高序号块，由执行体作为自身记录一次提交。内置 Agent 由 `modules/agent/runtime.ts` 装配，`selection.ts` 解析选择与策略，`admission.ts` 原子受理输入，`loop.ts` 每次从时间轴重新投影并推动下一请求；`projection.ts` 负责响应分组、事件后置与上下文末尾截取。`plugins/sdk-context.ts` 在具型写入入口统一校验与来源打戳，`plugins/records.ts` 直接映射通用记录信封。在途输出经 `session.progress` 的 `live` 字段按 `objectId` 提供给界面；异常收束时仍将已收到的内容保存为块，以完整性字段供审计。数据库结构只在运行时建库，仓储构造不隐式建表。

`SessionTree.select` 将选择审计与游标更新原子提交，`cursorSelections` 可读取日志。`seq` 只计节点追加，视图同步使用独立 `revision`。

`workspace.read` 只返回工作区与会话列表摘要，不接受会话身份或历史位置。应用导航打开会话后由 `features/session/` 读取正文，查看位置在该模块中维护。`runtime/workbench.ts` 管理资源事件与独立布局，在会话查询所固定的同一路径上投影对象；不再经应用快照中转。

画布库类型只存在于 renderer。IPC 不提供 SQL、任意路径、通用脚本或动态方法调用。对外工具协议不等于内部应用命令；模型与 MCP 接入时仍需独立资源校验与授权执行层。

插件配置经独立 `plugin-configuration` 通道读写，不加载会话。对象二进制流经 `shared/object-stream.ts` 的同一信封从任务进程送至 main、preload；两端用 Zod 校验后交付，preload 按会话与对象筛选订阅，不写入事件或转换正文。

语言偏好由 `main/language.ts` 管理，保存于 `language.json`；`preload` 只暴露语言读取、选择与订阅。插件静态目录由 `plugins/catalogs.ts` 在启动时读取，带 owner、规范化语言和内容修订，通过应用列表快照交付 renderer，包括没有前端入口的包。源消息按功能分别位于 `renderer/messages/` 与 `modules/messages/`，声明使用语义化引用名，目录按稳定的 owner/id 寻址；宿主译文在 `shared/locales/`，内置插件译文在 `modules/locales/`。会话准备与执行的插件错误统一由 `runtime/plugin-errors.ts` 适配，SDK 声明与作者路径见 [公共 i18n](../docs/i18n.md)。

## 开发与验证

- `npm run dev`：构建并运行 Electron，renderer 使用 Vite HMR。
- `npm run typecheck`：分别检查 Node 进程代码与 renderer。
- `npm test`：历史契约、应用事务与持久化、进程请求生命周期。
- `npm run build`：仅构建，不启动应用。
- `npm run i18n:extract` / `npm run i18n:check`：官方抽取、ICU／参数和翻译覆盖检查；可追加外部插件包根。
- `npm run package` / `npm run make`：构建后交给 Forge 打包，ZIP maker 支持三平台；当前只验证本机 macOS arm64 包内容。

GUI 由用户验证。测试使用独立临时数据库，结束后清理；不访问 Electron 的真实应用数据目录。

## 扩展入口

- 新增应用操作：先定义 shared 命令与响应，再在 runtime 实现事务/查询，最后接 UI。
- 模型与执行：运行时接入 provider 与工具调度；不在 React 生命周期执行，不把 provider 会话当任务历史。
- 资源与工具：按 [功能模块约定](modules/README.md) 添加纯契约、后台实现与前端视图，遵守统一工具 args 和实现自有 target/result；支持关系不替代执行授权。
- 外部插件：只消费 [公开 SDK](../packages/sdk/README.md)，后台使用具名模块入口，不依赖宿主的资源控制器或物理会话节点。
- 数据变更：发布前直接修改建表结构与 schema，不写迁移或兼容读取；旧开发数据删除重建。
- UI 布局：独立视图存储；不得把 React Flow 节点 JSON 作为持久领域模型。
