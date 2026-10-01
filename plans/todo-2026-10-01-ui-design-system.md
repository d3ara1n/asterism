# 完善公共组件与设计系统验收

> 已确认保留当前 UI 风格，后续 agent 不自行更换风格。窗口系统材质、部件布局与视觉真值见 `docs/design-system.md`。

> 按设置与既有页面的实际需要补齐控件；此计划负责公共组件，实施进度与验收随 UI 会话回填。

## 已有基础

- shadcn/ui + Radix + Tailwind，统一 Button/IconButton/Dialog/Select/Input/Textarea/Field/Item/Alert/Badge/Switch/Separator/Menu/PageState。
- 集中颜色、圆角、阴影及表面样式；Window 负责平台窗口布局；图标为 lucide-react，动效为 Motion。
- AGENTS 与设计文档约束新增功能复用现有组件和 token。

## 待实施

- 评估加深 `--muted-foreground`，使小字在背景上满足 WCAG AA 对比度（色相不变）。
- 需要可搜索选择时以 shadcn Combobox（Popover + cmdk）接入，依赖届时确认。
- 建立内部组件展示页，集中检查默认、悬停、聚焦、禁用、错误、空态与长文本。
- 若需要暗色内容主题，先确定主题行为和色板，再实现；原生材质跟随系统不代表已有完整暗色主题。
- 代码审查时保持公共组件和 token 的使用约定；不为视觉配置添加测试或测试基础设施。

## 验收

- 新业务页面主要组合公共组件与布局；不需要重新选择颜色、圆角或阴影。
- 基础状态、键盘操作、长名称与窄窗口由用户验收；agent 只做必要的类型检查和构建。组件展示页仅供人工查看。
- 完成后转移持久约定到 docs/design-system.md 并归档。
