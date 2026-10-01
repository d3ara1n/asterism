# 界面设计系统

## 已确认的视觉

织台使用浅灰绿色工作台、白色卡片与深青色操作强调。窗口作为系统材质底座，独立内容表面铺在其上；后续功能沿用此视觉，不随实现者重新设计。

- 左上是标题/任务入口，macOS 原生红黄绿置于该区域。
- 右上是紧凑快捷操作，Windows 原生窗口控件在右侧保留安全区。
- 下方是占据剩余空间的工作台。任务、对象、历史面板按需在工作台内展开。
- 窗口外沿与部件之间均留 6px 间隙，让系统材质可见。顶部表面高 32px；工作台和顶部部件使用 8px 圆角。采用紧凑桌面密度，标准按钮高 28px，顶部小按钮和图标按钮高 24px；不靠缩小正文字号压缩空间。
- 状态、画布控制和内容都处于对应表面内，外部间隙保持空白。

## 原生窗口与 Web 内容

| 平台 | 原生窗口 | 内容留白 |
| --- | --- | --- |
| macOS | hidden 标题栏 + 原生红黄绿 + under-window vibrancy | 原生按钮使用集中配置的坐标，左上按 Window Controls Overlay 报告的安全区避让 |
| Windows 11 22H2+ | hidden 标题栏 + titleBarOverlay + Acrylic | 使用 Window Controls Overlay 的环境变量避开右上控件 |
| 较旧 Windows | 原生控件覆盖 + 实色背景 | 与现代 Windows 使用相同内容布局 |
| Linux | 保留桌面环境窗口装饰 + 实色背景 | 不模拟 macOS/Windows 的系统按钮 |

主进程通过 nativeTheme 响应减少透明度/高对比度设置，必要时禁用材质。系统材质跟随系统外观；当前内容主题保持已确认的浅色。暗色内容主题需单独设计和验收。

系统材质使用 Electron 原生 API，不使用全窗口 CSS backdrop-filter 模拟桌面模糊，不开启 transparent 窗口模式。HTML、body、root 与 WindowShell 无不透明全屏底色。卡片与内容表面保留实色，确保文字可读。

macOS 覆盖区域高为顶部表面高度加两倍窗口边距。原生按钮位置在 `windowGeometry.macControlsPosition` 集中配置，当前为 `{ x: 20, y: 15 }` DIP，以提供更充足的左侧留白。自定义坐标替代系统默认位置，纵向观感需在目标系统验收；renderer 使用 titlebar-area-x 环境变量避让按钮区域。

窗口底座可拖动，包括外沿与部件之间露出的空白；标题区、操作区和工作台均完整排除拖动，保留给交互。根节点声明 drag，部件边界声明 no-drag；所有后代直接使用 `window-drag: initial` 重置，避免 Electron 44 的继承语义使画布变换后的后代生成超出可见边界的排除区域。不可用显式 none 代替 initial：Chromium 的历史兼容规则也会把显式 none 转为排除区域。弹窗和遮罩另行排除底座拖动。React Flow 的平移和卡片拖动不能触发窗口移动。改变布局后，初始卡片位置按实际工作台容器计算。

## 唯一维护入口

| 内容 | 入口 |
| --- | --- |
| 颜色、字体、圆角、阴影、共享表面 | `src/renderer/styles.css` |
| 控件行为与视觉变体 | `src/renderer/shared/ui/` |
| 窗口布局与原生控件留白 | `src/renderer/app/WindowShell.tsx` |
| 主进程和 renderer 共用的窗口尺寸 | `src/shared/desktop.ts` |
| 平台材质、实色回退与系统偏好监听 | `src/main/window-appearance.ts` |
| shadcn/ui 组件配置 | `components.json` |

主题采用语义 token：背景、卡片、前景、强调、次级、边框、焦点、危险、画布网点，以及控件/表面/弹窗三级圆角与阴影。原生窗口回退色在 window-appearance 中与工作台背景保持一致。

shadcn/ui 组件源码由项目维护，Radix 管理基础交互，Tailwind 表达布局与 token。业务页面只组合已有控件、布局与语义样式；不新增局部色板、任意阴影或独立控件皮肤。确需新增变体时进入公共组件，整体视觉变更须由用户确认。

## 演进与验证

公共输入/选择/图标组件、组件展示页与完整状态矩阵见 UI 设计系统立案。样式、布局、材质与控件位置由用户在真实平台直接验收，不为视觉配置编写测试；agent 只做必要的类型检查和构建。组件展示页用于人工查看状态，不作为截图或快照测试设施。构建成功不等于 GUI 验证通过。
