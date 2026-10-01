# 正式应用界面

桌面入口由 Electron 加载，`npm run dev` 启动。HTML 只负责挂载 React；页面的数据和操作来自受控桌面桥，不存在浏览器模拟回退。

## 模块职责

| 位置 | 职责 |
| --- | --- |
| `app/App.tsx` | 应用主视图、首页草稿、按需会话加载与设置导航 |
| `app/Sidebar.tsx` | 首页、会话摘要列表与设置入口，可隐藏 |
| `app/Window.tsx` | Window 与 Titlebar：平台差异、原生控件留白、窗口拖动区域 |
| `shared/weave/` | Space（受管空间与屏间平移）、Screen（屏内浮岛）、布局模型与动效参数 |
| `features/settings/` | 设置屏与分类注册表，通用偏好仍为预览 |
| `features/configuration/` | 提供商/模型角色/agent 表单、共享配置读取入口 |
| `features/home/HomePage.tsx` | 无背景首页输入区与真实 agent/模型/思考选择；发送当前禁用 |
| `features/workbench/SidePanel.tsx` | 对象、历史辅助面板 |
| `shared/i18n.ts` | 按系统语言选择的界面文案 |
| `app/controller.ts` | 串行提交命令、维护应用投影与连接/错误状态 |
| `features/workbench/CreateNoteDialog.tsx` | 已有工作台中的笔记创建 |
| `app/ErrorBoundary.tsx` | 渲染异常时提供重新加载入口 |
| `features/workbench/Workbench.tsx` | shared 对象到 React Flow 节点/边的投影与交互 |
| `features/workbench/ObjectNode.tsx` | 对象卡片外壳、代理状态与笔记内容 |
| `features/workbench/AccessDialog.tsx` | 显式资源绑定 |
| `features/workbench/placement.ts` | 新卡片初始位置，不重排已有卡片 |
| `shared/ui/` | 本地维护的 shadcn/ui Radix 控件 |
| `styles.css` | Tailwind、设计 token、画布与控件样式 |

## 界面约定

- 系统材质作为窗口底座；顶栏下方以两个浮岛承载应用侧栏和主内容。首页无页面背景，只有输入框有独立表面；工作台打开后有画布底板。四周和部件之间保持 6px 空隙，顶栏高 32px。只有底座空白可拖动窗口，部件整体用于交互；后代区域属性重置，避免画布坐标变换扩大排除区域。
- 浅灰绿色画布、白色卡片、深青操作强调；字体优先本地 Avenir Next / Segoe UI / 中文系统字体，不依赖在线字体。
- 启动固定进入首页，只读取会话列表摘要，不读取任何任务正文。已有会话须从侧栏明确选择；回首页清除已打开正文。草稿保存在应用层，不创建空任务，也不持久化为消息。
- 会话以运行时生成的 ID 标识，名称由 utility 异步生成；首页 agent/模型选择已接入，首次发送和命名尚未接入。用户命名笔记不等于为会话命名。
- 卡片关闭只隐藏视图；位置、折叠、隐藏和视口保存到独立视图表。
- 笔记目前支持创建与读取；绑定为读取授权。显示关系不会自动授权，连线暂不支持拖入创建绑定。
- 历史模式显示事件位置对应的对象与绑定，正文不可用时明确提示；返回当前重新查询，不恢复外部资源。
- 应用侧栏通过 `Screen.leading` 参与浮岛布局，隐藏后空间交给主内容；对象/历史辅助面板在工作台内浮动。窄窗口时顶栏按钮只显示图标，保留无障碍名称。应用窗口当前最小为 800×600，移动端非桌面框架验收目标。
- `Space` 在设置屏与主屏之间切换；侧栏与首页/工作台同属主屏，切到设置时整屏一起移走，不在主内容里嵌套页面带。
- 颜色、圆角与阴影只在主题入口维护；原生窗口几何使用 `src/shared/desktop.ts`。新功能复用公共控件和语义样式，完整约定见 `docs/design-system.md`。

## 未接入能力

壳子收尾与验收见 [首页计划](../../plans/todo-2026-10-02-home-navigation.md)、[UI 壳子计划](../../plans/todo-2026-10-01-ui-shell-settings.md) 和 [设计系统待办](../../plans/todo-2026-10-01-ui-design-system.md)。首页形式、设置屏、页面带与浮岛编织已实现；首次发送与首页到工作台的展开过渡随执行接入。通用分类仍为标注“预览”的示意内容，不读写偏好配置。

“提供商 / 模型 / 代理”已接入真实能力，分别管理连接及具体模型、模型角色、agent 配置。统一读取入口为 `features/configuration/state.ts`；消费时使用 shared 中的解析函数，不通过配置变更主动刷新已有选择。连接测试结果通知用于重新查询测试状态。设置不直接使用 provider SDK、数据库或凭据解密能力。语义见 [模型与代理配置](../../docs/model-configuration.md)。

代理执行、资源编辑、目录 IO、分叉/恢复、聚焦阅读与长历史虚拟化见 [运行时能力计划](../../plans/todo-2026-10-01-runtime-capabilities.md)，自动布局见 [布局计划](../../plans/todo-2026-09-18-workbench-layout.md)。

## 验证

UI 样式、布局、材质、窗口位置及交互由用户直接查看验收，不为视觉配置编写测试。agent 对界面改动做必要的类型检查和构建，不默认运行与本次 UI 改动无关的历史/运行时测试。
