# 应用界面

桌面入口由 Electron 加载，`npm run dev` 启动。HTML 只负责挂载 React；页面通过受控桌面桥消费真实能力，不存在浏览器模拟回退。

## 模块职责

| 位置 | 职责 |
| --- | --- |
| `app/App.tsx` | 首页与会话导航、应用级草稿、首次发送和设置导航 |
| `app/Sidebar.tsx` | 首页、会话摘要列表、设置入口与隐藏 |
| `app/Window.tsx` | Window/Titlebar、平台控件留白和拖动区域 |
| `app/controller.ts` | 会话列表读取与运行时连接状态，不持有当前会话 |
| `app/ErrorBoundary.tsx` | 渲染异常后的重新加载入口 |
| `features/home/HomePage.tsx` | 草稿、agent/模型/思考选择及首次发送 |
| `features/workbench/Workbench.tsx` | 对象/关系到画布的投影、定位和视图保存 |
| `features/workbench/canvas.ts` / `viewport.ts` | 统一的 `WorkbenchCanvas` 接口：`findPlacement` 寻找最近空位，`focusObjects` 聚焦任意对象集合；管理测量等待、隐藏视图打开、导航取消、动画保存与动态缩放下限 |
| `features/workbench/WorkbenchSurface.tsx` | 随导航立即入场的工作台底板、无内容画布与共用纹理 |
| `features/workbench/ObjectNode.tsx` | 消费已注册卡片投影，统一挂载 ObjectCard；缺失视图时显示原始数据 |
| `features/workbench/ObjectCard.tsx` | 对象卡片控件：Card 外壳、拖动柄、视图操作与内容区 |
| `features/workbench/ObjectsPanel.tsx` | 紧凑对象目录、搜索与画布定位，隐藏卡片定位时重新打开 |
| `features/workbench/ObjectActions.tsx` | 卡片更多菜单与移除确认 |
| `features/workbench/layout.ts` / `sizing.ts` | 卡片默认尺寸与下限、用户尺寸覆盖解析、默认位置与放置间距常量 |
| `features/workbench/connections.ts` | 合并双向链接的显示，保留对应有向关系；按可见卡片位置与尺寸投影四边动态端点，同边连线排序与分散 |
| `features/workbench/context.ts` | 工作台向卡片与更深浮岛提供的环境 |
| `features/workbench/nodes.ts` / `size-intents.ts` | 工作台节点投影，协调后台布局与本地拖动；尺寸意图在对应命令受理后的读取完成后确认 |
| `features/workbench/placement.ts` | 按新卡片尺寸和已有卡片实际边界求离指定中心最近的空位，不重排已有卡片 |
| `features/session/registry.ts` | 会话共享控制器 |
| `features/creation/` | 创建协调器：菜单、拖放与无路径图片粘贴的仲裁、路由记忆、异步输入、内容草稿、放置、提交与取消；`content.ts` 隐藏内容分块与读取协议，供创建及对象动作复用 |
| `features/workbench/AccessPanel.tsx` | 授权浮岛，按代理／资源查看有向链接，受理后的读取结束即显示实际状态 |
| `../modules/agent/conversation/Conversation.tsx` | 聚合时间线、跟随、输入、配置与交互；块从生成到保存保持同一组件 |
| `../modules/agent/conversation/ConversationTimeline.tsx` / `output-follow.ts` | 条目展示与滚动跟随，各自消费数据或明确意图 |
| `../modules/agent/conversation/Composer.tsx` / `ConfigurationPicker.tsx` | 消息输入与 Agent 配置选择 |
| `../modules/agent/conversation/draft.ts` / `Files.tsx` | 首页与对话共用的文件草稿、上传取消、图片缩略与附件控件 |
| `../modules/agent/conversation/interaction.ts` / `shared/submission.ts` | 按会话／对象保留草稿和提交身份，协调受理、重试、继续与停止；首页复用提交身份机制 |
| `../modules/agent/conversation/Disclosure.tsx` | 思考与工具共用的折叠外壳；统一边框、标题点击区、正文间距和展开箭头 |
| `../modules/agent/conversation/ToolCall.tsx` / `tool-state.ts` | 工具三态视图与开合投影；可选动态填充、填充结束自动折叠、后续保持手动选择 |
| `../modules/agent/conversation/ThinkingBlock.tsx` / `thinking-state.ts` | 思考 header 计时与 body 尾部窗口；自动开合偏好与内容渲染独立，结束后显示全文 |
| `features/conversation/tool-views.tsx` | 宿主固定入口的内置视图与 resource_call 转交；默认内容与详情控件在 shared/tool-content.tsx |
| `../modules/text-view.tsx` / `code-view.tsx` / `shared/tool-body.ts` | 内置正文三态、Pierre 差异与代码视图、120 行预览预算；模型反馈由后台独立生成 |
| `features/session/controller.ts` | 执行游标视图的协调查询、会话操作队列与独立进度订阅 |
| `features/session/History.tsx` / `history-navigation.ts` / `history-branches.ts` | 分支 Tab 与共享起点双向定位、两行逐节点列表、来源筛选、真实父节点定位与明确继续；Tab 与候选节点仅在面板内切换 |
| `features/session/state.ts` | 持久视图与进度的独立 React 订阅 |
| `../modules/agent/conversation/Markdown.tsx` | Streamdown 流式 Markdown 配置，复用库的解析与控件 |
| `modules/registry.ts` / `views.tsx` | 静态资源展示描述与按版本分派的卡片／工具 header/body；应用根注入注册目录 |
| `modules/object-context.ts` | 宿主实现基础对象接口；通过专门 provider 提供配置目录、模型块与工具展示，共用原有状态源 |
| `../modules/*/renderer.tsx` | 资源模块的具体卡片、附加操作和工具视图，与后端共用纯契约 |
| `features/configuration/` | 提供商/模型角色/agent 配置表单及共享读取入口 |
| `features/plugins/PluginsSettings.tsx` | 插件包管理、当前运行插件的配置读取及命令队列 |
| `features/plugins/PluginConfigurations.tsx` / `configuration-fields.ts` | 按插件生成具型配置表单；复杂值编辑、草稿、保存与恢复默认 |
| `features/configuration/forms.tsx` | 配置编辑器与字段公共入口；文本 placeholder、内置选择、显式空值与恢复操作在此复用 |
| `shared/ConfigurationChoice.tsx` | 首页与会话输入托盘共用的紧凑配置菜单 |
| `features/configuration/agent-selection.ts` | 首页与添加代理共用的创建前默认选择解析 |
| `features/settings/` | 设置屏与分类注册表；LanguageSettings 消费主进程语言设置，layout 提供共享分组与设置行 |
| `shared/weave/` | Space 屏间平移、Screen 浮岛、布局模型与动效 |
| `shared/ui/` | 本地维护的 shadcn/ui Radix 控件 |
| `shared/i18n.ts` | 应用级语言订阅与共享 React context，SDK hook 与宿主使用同一格式化环境 |
| `messages/`、`../shared/locales/` | 按功能组织的宿主默认消息与共享的简体中文目录；使用语义化引用名，保留稳定消息 ID；内置插件独立持有自己的消息 |
| `shared/tool-header.tsx` | 可复用的工具单行标题，名称与路径末尾省略，数量和类型等摘要保留右侧 |
| `styles.css` | Tailwind、主题 token、窗口与编织布局、Streamdown 与功能模块样式扫描 |

## 界面与状态约定

- 系统材质是窗口底座，侧栏和主内容为相邻浮岛。首页无页面背景，只有输入框形成表面；会话打开后主内容承载画布，代理卡片有独立内容表面。窗口间距、平台留白与拖动区域遵循 [设计系统](../../docs/design-system.md)。
- 启动固定进入首页，只读取列表摘要；用户明确选择后才加载会话正文。首页草稿保存在应用层，首次发送接受后清空；失败保留。会话输入草稿与提交去重身份在页面切换期间保留。
- 发送入口使用 `session.start`，由运行时生成 Session/agent/输入身份。初始标题取首条输入文字或文件名摘要的前 72 字符，配置了模型的 utility 角色执行两级自动命名，失败时保留当前标题；规则见 [自动会话命名](../../docs/session-naming.md)。创建期间用户若已导航，晚到结果只刷新列表，不夺回焦点或视图。
- 会话列表每行通过 `app/SessionActions.tsx` 的 more 菜单打开 `features/session/RenameSession.tsx` 对话框；more 在悬停、键盘聚焦或菜单打开时显示。当前会话由控制器提交 `rename` 并等待重读，其他会话直接提交命令，不加载正文或切换导航。草稿只在打开时初始化，视图未就绪时禁用当前会话的重命名，详细语义见 [人工命名](../../docs/session-naming.md#人工命名入口)。
- 会话导航立即切换，不等待首份投影。工作台底板与外观纹理先入场，投影返回后填入内容，保持同一页面过渡；读取期间不展示独立加载画面，失败时在工作台内保留错误与重试入口。
- 代理对象的卡片内部使用连续阅读区与底部输入区，卡片位于 React Flow 工作台。正文、思考和摘要交给 Streamdown；工具结果使用结构化用户数据展示，不向模型回传 GUI 状态。Enter 发送、Shift+Enter 换行；中文输入法确认不会触发发送。
- 资源卡片由模块的展示契约分派，工作台不判断具体资源种类如何绘制。工具的 input/execution/result 三态同级，各自的 headerRenderer/bodyRenderer 独立可选，共享阶段数据；组件可跨阶段复用，完整参数与过程/终结 data 经契约校验。历史按保存的实现 ID、当次资源身份和 data 渲染，缺失或不兼容时使用默认摘要/原始数据正文；不重新访问文件或当前资源。模块前端入口与后台入口分别编译，跨 IPC 只传身份和数据。
- 模型执行独立于组件生命周期。会话模块先订阅再查询，合并持久变化通知，以视图修订拒绝过时结果；命令执行使旧在途查询失效。返回首页、切换会话或设置只改变视图，不自动取消模型。应用列表刷新不读取或覆盖任何会话正文。
- 进度单独订阅，显示正在生成的正文、思考，以及填充、待执行或执行中的工具。块以 `responseId + ordinal` 保持展示身份，保存后由同一组件接替数据；进度若依赖尚未取得的持久修订，先保留原块再读取。实时进度不作为分支位置；画布布局不消费进度，绑定对象的 SDK 卡片独立订阅。
- 工具填充由可选 `input.headerRenderer/bodyRenderer` 消费运行时部分参数预览，未提供时保持静态准备提示。外壳按设置在填充时展开、填充结束或中断时折叠一次，之后的新产出、执行结束与落库不重置手动开合；外壳不限高，body 自行管理局部高度、滚动与渲染量，内置插件正文最多参与 120 个逻辑行。调用／结果详情默认不选中，通过单选控件切换，文件结果隐藏结果详情；原始详情不受正文行预算影响。工具三态应保持目标、数量和样式连续，允许按内容语义切换正文。固定资源入口由 Atelier 提供视图，resource_call 自己转交二级工具，外壳不判断具体工具。
- 正文与思考的即时块使用 Streamdown 流式模式，结束后切换静态模式。思考的 header 显示阶段与计时（起点由运行时提供），body 在生成时显示固定高度的尾部窗口，结束或中断后显示全文。外观设置分别控制自动展开与结束折叠，默认均开启；后续增量不覆盖手动选择，关闭结束折叠时保留当前状态。历史初次打开默认收起，没有保存的耗时不补造；空思考不显示折叠项。
- 运行时状态决定发送、停止和继续是否可用。历史面板点击只选中候选节点；明确继续才移动执行游标，随后追加才产生新路径。不完整块同样可查看与继续，模型投影独立决定采用哪些内容，不撤销资源影响。计量随所属块一次保存与展示，不另设终态历史节点。
- 网页链接经 HTTP(S) 协议检查后交给系统浏览器，不导航 Electron 主 frame。远程图片首批显示为来源链接；用户消息中的图片通过合法内容门面读取并生成短期 Blob URL，卸载或切换内容时回收。CSP 仅额外允许 blob 图片，不开放任意本机文件或远程图片读取。
- 会话控制器统一读取执行游标对应的工作台与对话；组件通过 `branchFrom` 明确跳转或提交会话操作，不持有独立查看位置。命令只返回受理结果，查询成功后统一更新画面。历史面板的候选选择不触发读取，卡片没有历史只读状态或返回实时视图入口。隐藏、展开、折叠、位置、尺寸与视口独立保存，不进入历史。
- `executeAndRead` 在命令受理后等待新读取结束，查询等待不占用命令队列，读取失败或断开也会结束等待；命令结果与读取错误分别表达。显式游标跳转或会话进入忙碌／未就绪状态时，旧对象定位意图失效；已经开始的画布过渡中断，旧完成回调不保存视口。
- 会话视图状态为 loading/ready/error，命令受理后仍须等新投影就绪才恢复配置等领域操作。读取失败保留原视图，重读成功后恢复就绪。会话错误在工作台独立提示，模态操作在对话框内提示，不依赖代理卡片展开。
- Sidebar 继续通过 `Screen.leading` 参与浮岛布局。设置是独立屏，侧栏和首页/会话同属主屏；切换设置整屏平移。窄窗口保持控件可访问，窗口当前最小为 800×600。
- 配色、圆角和密度消费共享主题；正文渲染复用库与语义 token，不自行实现 Markdown 解析器。图标使用 lucide-react，动效使用 Motion，普通控件复用 shadcn/ui。
- 本地化唯一消费者是普通用户；开发者组件展示、仅开发模式诊断、代码／协议与模型内容不进入翻译目录。语言变化只更新展示 context；面向用户的组件与静态贡献在显示时消费 UiText，不以译后标签或语言作为业务组件 key。配置、JSON 编辑文本、草稿、提交身份与任务沿用已有生命周期，模型上下文和历史正文不翻译。应用自有菜单随界面切换；Electron 默认菜单不在本轮接管范围。
- 设置中的角色与代理编辑器只编辑用户覆盖，使用配置能力返回的内置基准展示继承值，不把完整生效配置回填并保存。文本留空恢复内置；列表清空和布尔关闭通过明确选项表达。恢复内置值是草稿操作，保存后生效；已有对话从下一次模型请求采用新配置。会话和首页共用 ConfigurationChoice；当前选择与历史消息分别管理，游标回溯不恢复旧环境。

## 后续范围

真实模型与 GUI 验收、utility 命名与资源种类的实施记录见 [模型接入计划](../../plans/archived/todo-2026-10-01-model-protocol-storage.md)（已归档）。自动压缩见 [压缩计划](../../plans/todo-2026-10-13-context-compression.md)，跨模型续接见 [桥接计划](../../plans/todo-2026-10-13-cross-model-continuation.md)。资源编辑、目录 IO、多代理、恢复与长历史性能见 [运行时能力计划](../../plans/todo-2026-10-01-runtime-capabilities.md)，画布自动布局见 [布局计划](../../plans/todo-2026-09-18-workbench-layout.md)。

## 验证

类型检查和构建覆盖界面集成；异步状态、消息去重与链接边界在相应逻辑层验证，不搭建组件模拟渲染器。GUI 布局、滚动、Markdown 外观、窗口与真实服务由用户直接验收，不以自动化检查替代视觉确认。
