# 完善公共组件与设计系统验收

> 控件只用 shadcn 官方源码，外观只经主题 token 定制；颜色、圆角、密度与画布纹理为用户可选主题（见 `docs/decisions.md`）。窗口材质与部件布局见 `docs/design-system.md`。

> 按设置与既有页面的实际需要补齐控件；此计划负责公共组件，实施进度与验收随 UI 会话回填。

## 已有基础

- shadcn/ui new-york-v4 官方源码：Button/Card/Dialog/DropdownMenu/Select/Input/Textarea/InputGroup/Field/Item/Alert/Badge/Empty/Switch/Separator；PageState 由 Empty 组合。
- 表面只有 `surface` 与 `surface-floating` 两种；Window 负责平台窗口布局；图标为 lucide-react，动效为 Motion 与 tw-animate-css。
- AGENTS 与设计文档约束新增功能复用现有组件和 token。

## 待实施

- 首页输入区已定型为输入表面加选项托盘，配色仍有瑕疵，在主题预设上目测调整。
- 设置分类卡片 `.settings-card`/`.settings-detail` 改为官方 Card，保留共享元素展开动效。
- 评估加深 `--muted-foreground`，使小字在背景上满足 WCAG AA 对比度（色相不变）。
- 需要可搜索选择时以 shadcn Combobox（Popover + cmdk）接入，依赖届时确认。
- 建立内部组件展示页，集中检查默认、悬停、聚焦、禁用、错误、空态与长文本。
- 暗色内容主题：主题机制完成后单独实施，需适配原生材质、Windows 回退色与 nativeTheme 联动。
- 代码审查时保持公共组件和 token 的使用约定；不为视觉配置添加测试或测试基础设施。

## 验收

- 新业务页面主要组合公共组件与布局；不需要重新选择颜色、圆角或阴影。
- 基础状态、键盘操作、长名称与窄窗口由用户验收；agent 只做必要的类型检查和构建。组件展示页仅供人工查看。
- 完成后转移持久约定到 docs/design-system.md 并归档。
