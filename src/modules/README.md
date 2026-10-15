# 内置功能模块（`atelier.core`）

内置资源、代理、命名与工具在 `src/modules/` 下按功能共置，统一装配为内置插件 `atelier.core`，通过公开 `@atelier/sdk` 消费宿主能力。插件 SDK 机制见 [插件 SDK 与功能组合](../../docs/plugin-sdk.md)，作者接口示例见 [SDK 作者指南](../../packages/sdk/README.md)。

## 目录结构与三个静态入口

当前内置模块包括 `notes/`（笔记资源）、`filesystem/`（目录资源与文件操作）、`agent/`（内置代理控制器与对话视图）、`naming/`（自动与人工会话命名），以及存放共用工具契约、hashline 正文算法与前端预览投影的 `shared/`。

每个业务模块按进程边界拆分为三个入口（禁止互相导入或建立同时导出前后台的 barrel）：

| 文件 | 职责 | 可依赖 |
| --- | --- | --- |
| `contract.ts` | 纯 Zod 契约：资源状态、卡片数据、创建／动作契约、记录契约、工具实现的 `target / result` schema 与稳定 ID | Zod 与 `@atelier/sdk/contracts`，不依赖 Node 或 React |
| `runtime.ts` | 导出 SDK 模块或模块工厂：通过 `implementResource` 聚合 `project / inspect / context / creation / actions`，通过 `implementTool` 实现工具，声明 `observers` | `@atelier/sdk/runtime`、Node API、纯契约 |
| `renderer.tsx` | 默认导出 `RendererModule`：声明静态资源描述（`resources`）、卡片视图（`cardRenderer`）、工具三态视图（`toolRenderer`）、历史摘要（`recordRenderer`）与创建入口（`creationEntry`） | `@atelier/sdk/renderer`、React、`renderer/shared` 公共控件、纯契约 |

`modules/plugin.ts` 声明 `atelier.core` 命名空间；`modules/runtime.ts` 与 `modules/renderer.ts` 分别通过静态 glob 收集后台与前端模块并交由 `src/plugins/loader.ts` 或前端 `ViewRegistry` 装配。

## 工具编写与错误自愈准则

共享工具契约在 `shared/declarations.ts` 中通过 `defineTool({ id, name, description, guidelines, argsSchema })` 定义（当前含 `List / Read / Edit / Write / See`）；资源模块通过 `defineImplementation` 与 `implementTool` 绑定本资源的 `target` 和 `result` schema。一级宿主入口（`resource_list / inspect / call`）固定在 `src/tools/core.ts` 与 `src/execution/core.ts` 中维护，不进入模块工具目录。正文工具与 `toModel` 的具体契约见 [运行时](../../docs/runtime.md#原生正文工具与目录操作)。

新增或修改工具时，必须确保模型能凭首次说明构造合法调用，并凭错误反馈自愈：
- **Schema 描述完整**：`args`、`target`、`result` schema 均须有非空整体 `.describe(...)`，各字段明确 JSON 类型、定位基准、空值含义与限制，要求直接传 JSON 值而非序列化字符串。
- **参数校验精确**：返回具体字段路径与校验原因，同时报告 `target` 与 `args` 的问题，给出对应当前资源实现契约的修复提示。
- **失败原因可区分、下一步可执行**：使用稳定错误码区分路径不存在、越界、类型不符、权限不足与版本冲突，分别指明资源根失效还是内部目标失效。只读中止记 `cancelled`，无法确认写入影响记 `unknown` 并提示先检查资源再决定后续操作；不透传内部异常栈或凭据。

## 模块内部组织要点

- **`notes/` & `filesystem/`**：共用 `shared/text-contract.ts`、后台 `shared/text.ts`（及 `shared/hashline/`）与前端 `text-view.tsx / code-view.tsx / shared/tool-body.ts`（Pierre Diffs 渲染与 120 行逻辑行预算，启动时通过 `prepareCodeView` 预热高亮器）。笔记正文保存在 `session_data` 对象作用域的 `atelier.core/note.content`。
- **`agent/`**：后台由 `selection.ts`（配置与工具策略）、`admission.ts`（输入原子受理与幂等）、`loop.ts`（多轮 `models.run` 循环）、`compression.ts` / `compression-prompt.ts`（上下文自动压缩，见 [上下文自动压缩](../../docs/context-compression.md)）、`projection.ts`（时间线到模型消息投影）与 `state.ts / state-projection.ts`（执行状态投影）显式组合；前端 `agent/conversation/` 组合时间线展示、输出跟随、输入草稿与配置选择，`agent/diagnostics/` 从历史投影请求列表、适配已报告用量并展示费用与关联内容。通用单位计价在 `src/shared/model-cost-estimate.ts`，不依赖 agent。
- **`naming/`**：后台 `runtime.ts` 监听 `committed` 与 `cursorChanged`，结合 `policy.ts` 的材料采样规则调用 `utility` 模型生成标题，并通过显式公开接口 `NamingApi.nameByUser` 供应用组合层执行人工重命名（见 [自动会话命名](../../docs/session-naming.md)）。
