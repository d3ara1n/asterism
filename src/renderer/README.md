# 应用界面（Renderer）

桌面入口由 Electron 加载，通过 `window.host` 受控桌面桥消费真实能力，不存在浏览器模拟回退。交互规范见 [工作台交互](../../docs/workbench.md)，视觉与组件规范见 [界面设计系统](../../docs/design-system.md)。

## 目录与模块职责

| 位置 | 职责 |
| --- | --- |
| `app/App.tsx` | 首页与会话导航、应用级草稿、首次发送和设置屏切换 |
| `app/Sidebar.tsx` | 首页入口、会话摘要列表、设置入口与侧栏显隐 |
| `app/Window.tsx` | `Window / Titlebar`、平台原生控件留白和窗口拖动区域 |
| `app/controller.ts` | 会话列表读取、运行时连接状态与公共事件订阅，不持有已打开会话正文 |
| `app/SessionStatus.tsx` / `resource-status.ts` | 会话行状态徽标、资源进度 popup 与 `latest` 状态聚合 |
| `app/SessionActions.tsx` / `features/session/RenameSession.tsx` | 会话行 more 菜单与人工重命名对话框 |
| `app/ErrorBoundary.tsx` | 渲染异常后的重新加载入口 |
| `features/home/HomePage.tsx` | 首页草稿、agent/模型/思考选择及首次发送 |
| `features/workbench/Workbench.tsx` / `WorkbenchSurface.tsx` / `context.ts` | 对象与关系到 React Flow 画布的投影、过渡底板与视图保存；应用持有的工作台环境出口（`WorkbenchStore`）与按会话绑定的 `WorkbenchScope` |
| `features/workbench/feedback.ts` / `WorkbenchFeedback.tsx` | 独立于操作门禁的状态分类、延迟同步提示、读取异常与恢复入口；应用层协调通知去重 |
| `features/workbench/canvas.ts` / `viewport.ts` / `placement.ts` | `WorkbenchCanvas` 接口（`findPlacement` 最近空位、`locateObjects` 对象定位、动态缩放下限与视口保存） |
| `features/workbench/ObjectNode.tsx` / `ObjectCard.tsx` / `ObjectSurface.tsx` / `object-view.tsx` / `ObjectActions.tsx` | 已注册卡片分派、对象视图解析（`useObjectView`）、卡片外壳（拖动柄、折叠、画布滚轮归属）、卡片与聚焦浮岛共用的对象外壳（标题栏、辅助面板布局／焦点）、右下角缩放柄与尺寸预设／移除菜单 |
| `features/workbench/focus.ts` / `FocusIsland.tsx` | 以对象保留状态登记的聚焦身份与工作台左侧聚焦浮岛 |
| `features/workbench/layout.ts` / `sizing.ts` / `nodes.ts` / `size-intents.ts` | 卡片默认尺寸与下限、本地缩放拖动与后台布局同步协调 |
| `features/workbench/connections.ts` | 双向链接合并显示与卡片四边动态端点排序分布 |
| `features/workbench/ObjectsPanel.tsx` / `AccessPanel.tsx` | 右侧对象快速定位浮岛与有向授权管理浮岛 |
| `features/creation/` | 创建协调器：添加菜单、拖放与图片粘贴的候选仲裁、路由记忆、内容草稿（`content.ts`）与提交 |
| `features/session/controller.ts` / `registry.ts` / `retention.ts` / `state.ts` | 当前会话执行游标视图的协调查询、操作门禁队列与独立进度订阅；离开会话且命令收束后释放控制器；对象保留表及按就绪投影释放 |
| `features/session/History.tsx` / `history-navigation.ts` / `history-branches.ts` | 历史浮岛面板：分支 Tab、分叉点双向导航、两行逐节点列表、来源筛选与「从这里继续」跳转 |
| `features/conversation/tool-views.tsx` / `../../packages/ui/src/tool-content.tsx` | 三个宿主固定入口（`resource_*`）的内置视图、`resource_call` 转交适配与调用／结果原始详情切换 |
| `../../packages/builtin/src/agent/conversation/` | 内置 Agent 对话、输入与配置组件；`timeline.ts / turn-metrics.ts` 投影历史轮次与计量，`TurnMetrics.tsx / MetricTooltip.tsx` 展示轮尾只读概要与悬停详情，`ContextUsage.tsx` 展示输入区上下文占用 |
| `../../packages/builtin/src/agent/ui/` | Agent 扩展组件挂载、toolbar／overlay／modal 呈现、当前模型选择注入及输入区控制；作者通过 `@atelier/builtin-api/renderer` 接入，内置工具栏贡献在 `conversation/Toolbar.tsx`，应用注入贡献者偏好门面 |
| `../../packages/builtin/src/agent/diagnostics/` | 代理诊断的历史请求投影、当前价格计量、缓存与增长概览及面板内的列表／详情／汇总；`usage.ts / performance.ts` 供诊断和对话轮次共用实报用量及速率计算 |
| `../../packages/builtin/src/agent/context/` / `panel-kit.tsx` | 代理上下文面板的窗口占用、对话与系统构成；两个代理面板共用的版式、数值与系统构成部件 |
| `../../packages/builtin/src/text-view.tsx` / `code-view.tsx` / `shared/tool-body.ts` | 内置正文工具三态视图、Pierre Diffs 代码／差异渲染与 120 行预览预算截取 |
| `modules/registry.ts` / `views.tsx` / `object-context.ts` | 静态资源展示描述、卡片／工具／历史记录视图注册表与 SDK 前端对象接口注入 |
| `features/configuration/` | 提供商、模型发现（`ModelDiscoveryPicker.tsx`）、参数获取（`ModelParameters.tsx`）、模型兼容设置（`ModelCompatibilityEditor.tsx`）、模型角色与 agent 覆盖表单（`forms.tsx`） |
| `features/plugins/` / `shared/ConfigurationValue.tsx` | 插件包管理、插件配置表单与 schema 驱动字段编辑器 |
| `features/settings/` | 设置屏、分类注册表与语言设置（`LanguageSettings.tsx`） |
| `shared/weave/` | `Space` 屏间平移、`Screen` 浮岛编织纯布局模型（`model.ts`）与动效参数 |
| `../../packages/ui/src/ui/` | 本地维护的 shadcn/ui 官方源码与公共状态组合；主题绑定的 `sonner.tsx` 留在应用 `shared/ui/` |
| `shared/i18n.ts` / `messages/` | 应用级语言环境订阅、共享 `react-intl` context 与按功能组织的宿主消息声明 |
| `@atelier/ui/ConfigurationChoice` / `@atelier/builtin/renderer` / `@atelier/ui/tool-header` | 首页与创建表单的配置／模型／等级选择器及工具单行标题组件；对话专用摘要与浮层位于内置 Agent 的 `conversation/ConfigurationPicker.tsx` |
| `styles.css` | Tailwind、主题 token、窗口拖动重置与编织布局样式 |

## 前端状态协调要点

- **受理与重读门禁**：会话控制器通过 `executeAndRead` 在命令受理后等待新投影读取完成；读取未就绪前锁定领域配置操作，连续入队的意图依次等待前项投影同步。画布过渡期间若发生游标跳转或忙碌状态变化，旧定位意图自动取消。
- **持久视图与流式进度衔接**：会话模块先订阅再查询，以持久 `revision` 拒绝过时读取；`session.progress` 携带所依赖的 `revision`，先于持久视图到达时保留原块等待重读。输出块以 `responseId + ordinal` 为稳定 key，从流式生成到落库保持同一组件实例与展开状态。
- **草稿与附件生命周期**：首页草稿由应用持有；代理卡片的输入草稿、文件上传占用和 `submissionId`（重试幂等身份）经 `object.retained` 按对象保留，跨页面切换、卡片重挂载、聚焦与会话视图释放不丢失，对象离开当前投影时关闭草稿；用户消息中的图片通过受控 `object.content` 读取生成短期 Blob URL，卸载时回收。
- **覆盖表单与本地化**：角色与代理编辑器只提交用户显式覆盖（placeholder 显示内置基准，不回填保存）。组件在 render 中通过 `useI18n()` 格式化 `UiText`，不以 locale 或译后文本作为业务组件 key。
