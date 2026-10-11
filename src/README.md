# 源码地图

这是正式桌面应用，不依赖固定场景或浏览器内存演示。

首页、侧栏与三类真实配置已实现并验收。提供商保存/测试、模型角色和 agent 配置能力见 `configuration/README.md`；单代理核心与会话 IPC 已实现，契约见 [会话与单代理能力](../docs/conversation-core.md)，首页发送与代理对话视图已消费会话接口，真实端点与 GUI 验收按 [模型接入计划](../plans/todo-2026-10-01-model-protocol-storage.md) 推进。

| 目录 | 职责 | 依赖方向 |
| --- | --- | --- |
| `shared/` | 版本化命令、投影与传输校验 | 仅 Zod，不依赖任何进程或 UI |
| `main/` | Electron 窗口、单实例锁、数据目录、运行时生命周期、可信 IPC 路由 | shared，不调用数据库 |
| `preload/` | 沙箱桥，受控命令与状态订阅 | shared，只暴露 `window.host` |
| `runtime/` | 应用组合与列表；会话命令、历史查询、资源与布局、执行进度；SQLite、对象存储与私有凭据客户端 | shared、session、configuration、modules 后台入口、Node API |
| `configuration/` | 全局配置 JSON、密文凭据、连接测试与默认角色，见目录 README | shared、Node 文件系统、模型 SDK；不依赖 Electron 或数据库 |
| `session/` | 会话级扁平树、游标与吸附、模型投影、工作台折叠 | shared、SDK 纯契约、Node SQLite；不依赖 UI 或插件运行时 |
| `model/` | 系统提示块组装与模型投影、单次请求契约、三协议 SDK 适配与续接资料 | shared、session、AI SDK |
| `execution/` | 单次模型请求与工具批次、流块状态机、请求能力视图、外部工具策略与固定宿主操作入口；外层循环归插件 Agent | model、resources、tools、存储格式 adapter |
| `resources/` | 资源身份生成、后台契约、注册目录、卡片投影与环境聚合 | shared、session 对象类型、Nano ID |
| `tools/` | 两层共用的工具定义投影、实现注册与产出校验、终结模型投影、支持关系；不持有外部授权策略 | shared、session 对象类型 |
| `plugins/` | 包加载、配置／凭据／任务托管、公开 SDK 的会话与对象门面、资源与工具 adapter、提交后派发 | SDK、session、resources、tools；内置旧工厂仅用于迁移 |
| `modules/` | core 的资源、代理、命名与视图；`modules/shared/` 承接共享工具契约和正文算法，见目录 README | 后台/前端分入口；目录后台消费公开 SDK，其余后台按计划迁移 |
| `renderer/` | 应用视图、视图注册机制、React Flow、用户意图 | shared、modules 前端入口、React 与 UI 库；不访问 Node/数据库 |

## 完整路径

`renderer/features/session → preload → main/RuntimeHost → utilityProcess → SessionService → SessionTree / SessionWorkbench / ObjectStore`

会话命令先由 Zod 校验，再交运行时单一写入者处理。业务创建、查询索引与初始视图处于同一事务；正文引用只在内容文件成功落盘后进入事件。命令返回受理结果，读取返回指定位置的会话树与工作台投影，UI 将其映射为画布和代理对话。

路径遍历、块识别和合法续接判断统一位于 `shared/session-path.ts`，运行时与 renderer 共用。`execution/request.ts` 完成一次补全及工具批次，`execution/response.ts` 只持有该响应的临时流状态；具型块与终态交消费方提交到时间轴。内置 Agent 在 `modules/agent/runtime.ts` 推动外层循环，每次从时间轴重新投影，`modules/agent/model-events.ts` 承接既有保存格式。未完成输出经 `session.progress` 的 `live` 字段提供给界面，不写入存储；完整读取携带当前进度以恢复连接。数据库结构只在运行时建库，仓储构造不隐式建表。

块的 `requestParentId` 记录请求使用的路径末端；`session/projection.ts` 在该位置后组合响应，把期间事件留在响应外。终态通过 `SessionTree.completeBlock` 只追加一次并绑定到最高序号块，读取时合并可空字段，原始节点不变。`SessionTree.select` 将选择审计与游标更新原子提交，`cursorSelections` 可读取日志。`seq` 只计节点追加，视图同步使用独立 `revision`，涵盖计量、游标、配置选择和布局变化。

SQLite 的 `session_blocks` 视图可直接查询每块计量；`session_usage` 还包含没有输出块的异常诊断计量。例如：

```sql
SELECT model, SUM(json_extract(usage, '$.total')) AS tokens
FROM session_usage WHERE session_id = ? GROUP BY model;
```

`workspace.read` 只返回工作区与会话列表摘要，不接受会话身份或历史位置。应用导航打开会话后由 `features/session/` 读取正文，查看位置在该模块中维护。`runtime/workbench.ts` 管理资源事件与独立布局，在会话查询所固定的同一路径上投影对象；不再经应用快照中转。

画布库类型只存在于 renderer。IPC 不提供 SQL、任意路径、通用脚本或动态方法调用。对外工具协议不等于内部应用命令；模型与 MCP 接入时仍需独立资源校验与授权执行层。

## 开发与验证

- `npm run dev`：构建并运行 Electron，renderer 使用 Vite HMR。
- `npm run typecheck`：分别检查 Node 进程代码与 renderer。
- `npm test`：历史契约、应用事务与持久化、进程请求生命周期。
- `npm run build`：仅构建，不启动应用。
- `npm run package` / `npm run make`：构建后交给 Forge 打包，ZIP maker 支持三平台；当前只验证本机 macOS arm64 包内容。

GUI 由用户验证。测试使用独立临时数据库，结束后清理；不访问 Electron 的真实应用数据目录。

## 扩展入口

- 新增应用操作：先定义 shared 命令与响应，再在 runtime 实现事务/查询，最后接 UI。
- 模型与执行：运行时接入 provider 与工具调度；不在 React 生命周期执行，不把 provider 会话当任务历史。
- 资源与工具：按 [功能模块约定](modules/README.md) 添加纯契约、后台实现与前端视图，遵守统一工具 args 和实现自有 target/result；支持关系不替代执行授权。
- 外部插件：只消费 [公开 SDK](../packages/sdk/README.md)，后台使用具名模块入口，不依赖宿主的资源控制器或物理会话节点。
- 数据变更：发布前直接修改建表结构与 schema，不写迁移或兼容读取；旧开发数据删除重建。
- UI 布局：独立视图存储；不得把 React Flow 节点 JSON 作为持久领域模型。
