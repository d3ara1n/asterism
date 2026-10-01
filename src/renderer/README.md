# 正式工作台界面

桌面入口由 Electron 加载，`npm run dev` 启动。HTML 只负责挂载 React；页面的数据和操作来自受控桌面桥，不存在浏览器模拟回退。

## 模块职责

| 位置 | 职责 |
| --- | --- |
| `app/App.tsx` | 任务选择、按需面板与对话框组合 |
| `app/Window.tsx` | Window 与 Titlebar：平台差异、原生控件留白、窗口拖动区域 |
| `shared/weave/` | Space（受管空间与屏间平移）、Screen（屏内浮岛）、布局模型与动效参数 |
| `features/settings/` | 设置屏：分类注册表与示意内容（`preview.tsx`） |
| `features/workbench/SidePanel.tsx` | 任务、对象、历史辅助面板 |
| `shared/i18n.ts` | 按系统语言选择的界面文案 |
| `app/controller.ts` | 串行提交命令、维护应用投影与连接/错误状态 |
| `app/CreateDialog.tsx` | 用户创建任务、代理、笔记的输入 |
| `app/ErrorBoundary.tsx` | 渲染异常时提供重新加载入口 |
| `features/workbench/Workbench.tsx` | shared 对象到 React Flow 节点/边的投影与交互 |
| `features/workbench/ObjectNode.tsx` | 对象卡片外壳、代理状态与笔记内容 |
| `features/workbench/AccessDialog.tsx` | 显式资源绑定 |
| `features/workbench/placement.ts` | 新卡片初始位置，不重排已有卡片 |
| `shared/ui/` | 本地维护的 shadcn/ui Radix 控件 |
| `styles.css` | Tailwind、设计 token、画布与控件样式 |

## 界面约定

- 系统材质作为窗口底座；左上标题/任务区、右上操作区、下方工作台分别作为内容表面。四周和部件之间保持 6px 空隙，顶栏高 32px；辅助面板在工作台内按需展开。只有底座空白可拖动窗口，部件整体用于交互；后代区域属性重置，避免画布坐标变换扩大排除区域。
- 浅灰绿色画布、白色卡片、深青操作强调；字体优先本地 Avenir Next / Segoe UI / 中文系统字体，不依赖在线字体。
- 所有任务和对象身份来自运行时，名称来自用户输入；未配置模型只显示不可执行状态。
- 卡片关闭只隐藏视图；位置、折叠、隐藏和视口保存到独立视图表。
- 笔记目前支持创建与读取；绑定为读取授权。显示关系不会自动授权，连线暂不支持拖入创建绑定。
- 历史模式显示事件位置对应的对象与绑定，正文不可用时明确提示；返回当前重新查询，不恢复外部资源。
- 辅助面板不缩小画布；窄窗口时顶栏按钮只显示图标，保留无障碍名称。应用窗口当前最小为 800×600，移动端非桌面框架验收目标。
- 颜色、圆角与阴影只在主题入口维护；原生窗口几何使用 `src/shared/desktop.ts`。新功能复用公共控件和语义样式，完整约定见 `docs/design-system.md`。

## 未接入能力

壳子收尾与验收见 [UI 壳子计划](../../plans/todo-2026-10-01-ui-shell-settings.md) 和 [设计系统待办](../../plans/todo-2026-10-01-ui-design-system.md)。设置屏、页面带与浮岛编织已实现；通用与模型分类目前是标注“预览”的示意内容，不读写配置，提供商阶段须整体替换。

提供商配置与连接测试待 UI 前置完成后接入，见 [模型接入计划](../../plans/todo-2026-10-01-model-protocol-storage.md)。设置页面通过能力接口管理配置，不直接使用 provider SDK、数据库或凭据解密能力。未实现能力不提供假按钮、固定回复或示例状态。

代理执行、资源编辑、目录 IO、分叉/恢复、聚焦阅读与长历史虚拟化见 [运行时能力计划](../../plans/todo-2026-10-01-runtime-capabilities.md)，自动布局见 [布局计划](../../plans/todo-2026-09-18-workbench-layout.md)。

## 验证

UI 样式、布局、材质、窗口位置及交互由用户直接查看验收，不为视觉配置编写测试。agent 对界面改动做必要的类型检查和构建，不默认运行与本次 UI 改动无关的历史/运行时测试。
