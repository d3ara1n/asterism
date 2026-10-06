# 完善公共组件与设计系统验收

> 控件只用 shadcn 官方源码，外观只经主题 token 定制；颜色、圆角、密度与画布纹理为用户可选主题（见 `docs/decisions.md`）。窗口材质与部件布局见 `docs/design-system.md`。

> 按设置与既有页面的实际需要补齐控件；此计划负责公共组件，实施进度与验收随 UI 会话回填。

## 已有基础

- shadcn/ui new-york-v4 官方源码：Button/Card/Dialog/DropdownMenu/Select/Input/Textarea/InputGroup/Field/Item/Alert/Badge/Empty/Switch/Separator；PageState 由 Empty 组合。
- 表面只有 `surface` 与 `surface-floating` 两种；Window 负责平台窗口布局；图标为 lucide-react，动效为 Motion 与 tw-animate-css。
- AGENTS 与设计文档约束新增功能复用现有组件和 token。

## 待实施

- 需要可搜索选择时以 shadcn Combobox（Popover + cmdk）接入，依赖届时确认。
- 亮暗主题：系统为深色时窗口材质变暗，而内容文字始终为深色，直接位于材质上的文字与表面外沿（首页标题、提示、输入区边框）看不清；随亮暗主题一并解决。
- 暗色内容主题：主题机制完成后单独实施，需适配原生材质、Windows 回退色与 nativeTheme 联动。
- 字体设置：界面、代码编辑器、Markdown 三组字体各自可选，各带字号；存于外观设置。
- 代码审查时保持公共组件和 token 的使用约定；不为视觉配置添加测试或测试基础设施。

## 验收

- 新业务页面主要组合公共组件与布局；不需要重新选择颜色、圆角或阴影。
- 基础状态、键盘操作、长名称与窄窗口由用户验收；agent 只做必要的类型检查和构建。组件展示页仅供人工查看。
- 完成后转移持久约定到 docs/design-system.md 并归档。
