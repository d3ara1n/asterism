# 应用界面

桌面入口由 Electron 加载，`npm run dev` 启动。HTML 只负责挂载 React；页面通过受控桌面桥消费真实能力，不存在浏览器模拟回退。

## 模块职责

| 位置 | 职责 |
| --- | --- |
| `app/App.tsx` | 首页与会话导航、应用级草稿、首次发送和设置导航 |
| `app/Sidebar.tsx` | 首页、会话摘要列表、设置入口与隐藏 |
| `app/Window.tsx` | Window/Titlebar、平台控件留白和拖动区域 |
| `app/controller.ts` | 串行工作区查询与运行时连接状态 |
| `app/ErrorBoundary.tsx` | 渲染异常后的重新加载入口 |
| `features/home/HomePage.tsx` | 草稿、agent/模型/思考选择及首次发送 |
| `features/workbench/Workbench.tsx` | 对象/关系到画布的投影、定位和视图保存 |
| `features/workbench/ObjectNode.tsx` | 按对象种类选择卡片内容 |
| `features/workbench/ObjectCard.tsx` | 对象卡片控件：Card 外壳、拖动柄、视图操作与内容区 |
| `features/workbench/SidePanel.tsx` | 对象、历史面板浮岛 |
| `features/workbench/context.ts` | 工作台向卡片与更深浮岛提供的环境 |
| `features/workbench/placement.ts` | 新卡片初始位置，不重排已有卡片 |
| `features/conversation/session.ts` | 每个代理对话共享的控制器与提交身份 |
| `features/workbench/CreateNoteDialog.tsx` / `AccessDialog.tsx` | 已有笔记创建与显式资源绑定入口 |
| `features/conversation/Conversation.tsx` | 主代理连续对话、工具过程、停止/继续、历史查看与分支 |
| `features/conversation/controller.ts` | 通知合并查询、单调快照、命令状态与提交身份 |
| `features/conversation/Markdown.tsx` | Streamdown 流式 Markdown 配置，复用库的解析与控件 |
| `features/configuration/` | 提供商/模型角色/agent 配置表单及共享读取入口 |
| `features/configuration/forms.tsx` | 配置编辑器与字段公共入口；文本 placeholder、内置选择、显式空值与恢复操作在此复用 |
| `features/settings/` | 设置屏与分类注册表，通用偏好仍为预览 |
| `shared/weave/` | Space 屏间平移、Screen 浮岛、布局模型与动效 |
| `shared/ui/` | 本地维护的 shadcn/ui Radix 控件 |
| `shared/i18n.ts` | 按系统语言显示单语文案 |
| `styles.css` | Tailwind、主题 token、窗口与编织布局、Streamdown 样式扫描 |

## 界面与状态约定

- 系统材质是窗口底座，侧栏和主内容为相邻浮岛。首页无页面背景，只有输入框形成表面；会话打开后主内容承载画布，主代理卡片有独立内容表面。窗口间距、平台留白与拖动区域遵循 [设计系统](../../docs/design-system.md)。
- 启动固定进入首页，只读取列表摘要；用户明确选择后才加载会话正文。首页草稿保存在应用层，首次发送接受后清空；失败保留。会话输入草稿与提交去重身份在页面切换期间保留。
- 发送入口使用 `conversation.start`，由运行时生成 Task/agent/输入身份。标题当前取首条输入，utility 异步命名待接入。创建期间用户若已导航，晚到结果只刷新列表，不夺回焦点或视图。
- 主代理对象的卡片内部使用连续阅读区与底部输入区，卡片位于 React Flow 工作台。正文、思考和摘要交给 Streamdown；工具结果使用结构化用户数据展示，不向模型回传 GUI 状态。Enter 发送、Shift+Enter 换行；中文输入法确认不会触发发送。
- 模型执行独立于组件生命周期。先订阅再查询，合并执行通知并只接受不倒退的 seq。返回首页、切换会话或设置只改变视图，不自动取消模型。
- 运行时状态决定发送、停止和继续是否可用。历史查看不改变执行游标；只有明确选择完整节点继续，才在旧位置追加新路径。不完整响应可查看，重试从之前完整位置另起分支，不撤销资源影响。
- 网页链接经 HTTP(S) 协议检查后交给系统浏览器，不导航 Electron 主 frame。远程图片首批显示为来源链接；保持现有 CSP，不因显示模型文本扩大本机文件或网络权限。
- 工作台按 Task 的对象和关系投影卡片与连线。主代理卡片消费真实会话，其他已有对象保留自身视图；隐藏、折叠、位置与视口不改变领域状态。没有对话记录的早期代理显示说明，不伪造消息。可添加资源另行收敛，工作台形态与对象模型不变。
- Sidebar 继续通过 `Screen.leading` 参与浮岛布局。设置是独立屏，侧栏和首页/会话同属主屏；切换设置整屏平移。窄窗口保持控件可访问，窗口当前最小为 800×600。
- 配色、圆角和密度消费共享主题；正文渲染复用库与语义 token，不自行实现 Markdown 解析器。图标使用 lucide-react，动效使用 Motion，普通控件复用 shadcn/ui。
- 设置中的角色与代理编辑器只编辑用户覆盖，使用配置能力返回的内置基准展示继承值，不把完整生效配置回填并保存。文本留空恢复内置；列表清空和布尔关闭通过明确选项表达。恢复内置值是草稿操作，保存后生效；已有对话配置不刷新。

## 后续范围

真实模型与 GUI 验收、utility 命名、自动压缩与资源种类见 [模型接入计划](../../plans/todo-2026-10-01-model-protocol-storage.md)。资源编辑、目录 IO、多代理、恢复与长历史性能见 [运行时能力计划](../../plans/todo-2026-10-01-runtime-capabilities.md)，画布自动布局见 [布局计划](../../plans/todo-2026-09-18-workbench-layout.md)。

## 验证

类型检查和构建覆盖界面集成；异步状态、消息去重与链接边界在相应逻辑层验证，不搭建组件模拟渲染器。GUI 布局、滚动、Markdown 外观、窗口与真实服务由用户直接验收，不以自动化检查替代视觉确认。
