# 源码地图

这是正式桌面应用，不依赖固定场景或浏览器内存演示。

首页、侧栏与三类真实配置已实现并验收。提供商保存/测试、模型角色和 agent 配置能力见 `configuration/README.md`；单代理核心与会话 IPC 已实现，契约见 [会话与单代理能力](../docs/conversation-core.md)，首页发送与主代理对话视图已消费会话接口，真实端点与 GUI 验收按 [模型接入计划](../plans/todo-2026-10-01-model-protocol-storage.md) 推进。

| 目录 | 职责 | 依赖方向 |
| --- | --- | --- |
| `shared/` | 版本化命令、投影与传输校验 | 仅 Zod，不依赖任何进程或 UI |
| `main/` | Electron 窗口、单实例锁、数据目录、运行时生命周期、可信 IPC 路由 | shared，不调用数据库 |
| `preload/` | 沙箱桥，受控命令与状态订阅 | shared，只暴露 `window.weft` |
| `runtime/` | 应用命令、查询、事务、SQLite 迁移、对象存储与私有凭据客户端 | shared、history、configuration、Node 内建 API |
| `configuration/` | 三类配置、密文凭据、连接测试与默认角色，见目录 README | shared、Node SQLite、模型 SDK；不依赖 Electron |
| `history/` | 事件存储、轮次与绑定、历史投影 | Node SQLite、Zod；不依赖 renderer |
| `conversation/` | 会话树投影、续接约束、压缩与扩展节点 | shared、history；不依赖 UI/SDK |
| `model/` | 系统提示块组装与模型投影、单次请求契约、三协议 SDK 适配与续接资料 | shared、conversation、AI SDK |
| `execution/` | 单代理循环、工具授权与批次收束 | conversation、model 契约、history |
| `renderer/` | 应用视图、React Flow、用户意图 | shared、React 与 UI 库；不访问 Node/数据库 |

## 完整路径

`renderer/controller → preload → main/RuntimeHost → utilityProcess → ApplicationService → HistoryKernel / ObjectStore`

每次应用命令先由 Zod 校验，再交运行时单一写入者处理。业务创建、查询索引与初始视图处于同一事务；正文引用只在内容文件成功落盘后进入事件。运行时返回应用投影，UI 将它映射为画布节点和连线。

`workspace.read` 不带 `task_id` 时只返回工作区与会话列表摘要，`task` 为 null；启动与回首页均走此路径。读取具体正文和历史必须显式指定任务。

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
- 资源类型：定义资源能力、授权与版本约束，再接运行时操作和专门视图。当前笔记只读，不代表目录已获授权。
- 数据变更：提高应用 SQLite 迁移版本；兼容旧事件或显式迁移，不修改旧历史来迎合新 UI。
- UI 布局：独立视图存储；不得把 React Flow 节点 JSON 作为持久领域模型。
