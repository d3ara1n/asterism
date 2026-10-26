# 插件 SDK 与功能组合

本文规定插件 SDK（`@asterism/sdk`）的接口、模块组合方式与宿主职责。产品与授权原则见 [运行时](runtime.md)，宿主进程与打包机制见 [技术架构](architecture.md#应用组合与宿主机制)，作者快速上手与代码示例见 [SDK 作者指南](../packages/sdk/README.md)。

## 模块与装配

SDK 的 `contracts`、`runtime`、`renderer` 三个子路径分别承担纯契约（不依赖 Node 或 React）、后台接口和前端接口：

| 层次 | 职责 | 接口的消费方 |
| --- | --- | --- |
| SDK 契约 | 资源、创建、动作、记录、宿主服务与功能贡献的稳定接口 | 宿主、插件与应用组合层 |
| 宿主机制 | 路由、校验、事务、授权、运行生命周期、传输与存储编码 | SDK 的宿主实现 |
| 插件业务模块 | 配置选择、输入受理、执行循环、正文编辑与视图等领域功能 | 插件自己的装配入口和其他业务模块；公开领域接口也可由应用组合层消费 |
| 应用组合层 | 连接宿主能力与内置插件公开领域接口，组成用户操作入口 | Asterism 应用 |

插件是身份、设置与生命周期的归属单位，功能模块是插件内部的组合单位。插件级能力不要求通过占位模块登记：

- **静态元信息**：名称、简介、图标、版本、作者等来自可独立读取的包元信息；展示插件信息不依赖执行插件代码，禁用或加载失败时仍可管理。
- **后台装配**：插件具有自身的装配入口，可初始化共享业务服务、登记可选托管配置、插件级调用与清理责任，再通过显式参数将共享服务交给功能模块。插件可以没有功能模块。
- **前端装配**：插件前端入口拥有可选设置页面及插件级准备与清理责任，并组合功能视图模块；设置页面不要求关联资源，也不要求伪装为卡片 renderer。

后台以 `definePlugin({ namespace, version, setup?, modules? })` 声明，插件 `setup` 同步返回贡献与可选功能模块，清理登记到 `plugin.lifetime`（见 [生命周期作用域](#生命周期作用域)）；根入口返回的模块先于静态 `modules` 装配。前端以 `defineRendererPlugin({ modules?, settings?, prepare?, closing? })` 声明，`settings` 包含 `Body` 与可选内部定位 `locations`，组件接收 `location`。具体作者用例与包清单见 [SDK 作者指南](../packages/sdk/README.md#4-插件装配与设置页面)。

`PluginModule.setup` 是功能贡献装配入口，接收完整 `PluginContext`，创建业务模块、连接依赖并返回 `ModuleContribution`。业务模块是普通函数、闭包或对象，只接收需要的具名接口；复用一个业务模块不要求将它注册为 `PluginModule`。调用或事件由插件入口还是功能模块登记，不改变契约归属与作用域；宿主共用身份检查、冲突校验和生命周期机制。

一项功能的纯契约、后台实现和前端视图共置、分入口编译。组合以显式导入和参数传递完成，不引入通用服务查找、动态依赖注入容器、无具型契约的字符串事件总线或任意生命周期 hook 集合。宿主在启动时装配并冻结贡献，安装、启用、禁用与升级重启后生效。贡献身份由宿主按插件命名空间补全为 `<pluginId>/<name>`（工具契约 `name` 为模型可见全局短名）。插件缺席时历史与对象保留，资源投影为 `asterism.builtin/missing-resource`，视图回退默认渲染与原始数据。

单个后台或前端入口导入的等待上限为 10 秒；导入失败或超时标记该插件失败，并阻止依赖方装配，无关插件继续。插件后台 `setup` 仍同步完成贡献登记，联网等异步工作由插件托管任务承载。整个应用的启动期限、进度和编译缓存见 [启动与加载](architecture.md#启动与加载)。

## 工具贡献

模块可以贡献顶层工具或资源工具，两类调用关系与执行规则见 [运行时](runtime.md#工具匹配与宿主操作入口)，同名贡献的选择、替换范围与冲突校验见 [工具覆盖](runtime.md#工具覆盖)。

- **顶层工具**：模块直接提供包含定义与 handler 的完整声明，宿主在装配时注册。声明即定义，不要求经过资源工具的共享定义、导出契约、资源实现链路，也不要求声明支持的资源类型或 `target`。前后端需要共享展示或交互的数据契约时可单独共享，不因此拆成多个资源后端实现。
- **运行上下文**：顶层工具 handler 在每次调用时取得宿主绑定的当前执行对象、会话及取消等调用环境；静态声明与运行时数据分开。当前对象和会话的操作仍遵守宿主门面、提交及生命周期契约，模型参数不负责声明发起者身份。
- **资源工具**：共享工具契约与针对资源类型的实现分开声明，由工具目录按资源支持关系匹配。

资源工具的 `implementTool` handler 接收 `{ object, caller, signal, publish }`（API 11.3）。`object` 为已授权目标的执行门面，`caller: ToolCaller` 只包含发起资源的 `{ ref, title }`，由宿主在模型请求边界捕获并冻结；调用者身份与目标对象分别绑定，模型参数不声明来源。caller 不携带私有数据或额外授权。

后台通过 `defineTopLevelTool({ id, name, description, guidelines, argsSchema, resultSchema, effect, execution, execute, toModel? })` 声明，交给 `ModuleContribution.topLevelTools`。`execute(args, { object, session, callId, signal, publish })` 的 `object` 为绑定执行者的只读门面；不能据此写入其他插件资源或读取其私有数据。`session` 是本次工具执行绑定的 `ToolSession`，操作范围见下方会话资源接口。插件自有业务状态通过模块内共享服务管理。结果校验、过程发布、终结投影及批次调度沿用工具执行链路；展示契约可以独立共享同一稳定 ID，经 `toolRenderer` 渲染。

## 提供商与用量目录（API 10.0）

插件通过根入口或模块的 `ModuleContribution` 提供两类声明；内置插件采用同一管线，宿主不内置厂商预设或查询函数：

- **`usageProviders`**：查询身份是全局目录 ID，可与预设 ID 同名，归属另由宿主记录；重复身份拒绝加载，不能凭同名覆盖其他查询实现。来源与数据种类独立，结果经公共 schema 校验。提供方用 `UsageQueryError(code)` 报告公开错误类别。
- **`modelProviderPresets`**：`{ type: "add", preset }` 新增完整预设；`{ type: "patch", id, patch }` 修改已有预设。patch 按顶层字段覆盖，`connection` 按字段合并，其中数组整项替换；预设 ID 不可由 patch 改写。新增同名身份或修改不存在的身份均报错，修改 `usage` 只修改引用，不替换对应查询实现。

贡献按插件依赖装配顺序、模块声明顺序应用；修改另一插件新增的预设时须声明对该插件的依赖。声明整体校验通过才加入目录，插件装配失败撤销该插件的全部查询与预设贡献，后置依赖失败共同撤销。插件关闭先停止查询并等待真实收束，再释放服务。安装、禁用与升级仍按插件既有规则重启生效。

`UsageProvider` 按来源分为两种声明：

- **主动来源**：`QueryUsageProvider = { id, label, source?: "query", query }`。`query({ connection: { id, endpoint }, credential, signal })` 异步返回 `UsageItem[]`；参数由消费者显式提供。
- **响应头来源**：`HeadersUsageProvider = { id, label, source: "headers", parseHeaders }`。同步 `parseHeaders({ connection, model, status, receivedAt, headers })` 返回 `UsageItem[] | null`；消费者提供小写字段名的响应头、毫秒接收时间和服务端模型 ID。null 表示没有新数据，空列表明确报告空结果。实现不能返回 Promise；解析失败由消费者处理。

后台目录与 `plugin.models` 采用同一边界：宿主负责登记、查找、契约校验和生命周期，消费方式由插件决定。

- `plugin.modelProviders.presets()` 返回组合后的预设；`list()`／`get(id)` 返回不含凭据的当前连接配置（含 `usage` 引用）；`credential(id, { signal? })`（API 14.0）显式读取该连接的当前凭据，无鉴权连接返回 null。这是受信后台插件的能力，不向前端暴露凭据库引用或原始密钥。
- `plugin.usageProviders.list()` 返回提供方描述；`get(id)` 返回可调用的 query／headers 实现或 null。句柄绑定登记实例，撤销后不能接管同 ID 的新实现。query 参与提供方和调用方的取消与真实收束，headers 同步执行；宿主不代选连接、不代取凭据、不保存结果。
- `plugin.usages.query(id, context)`／`parseHeaders(id, context)` 是无状态用量服务，按显式提供方 ID 分派；连接、凭据与响应由消费者交付，来源不匹配时报告 unsupported。消费者的缓存与展示状态仍属于消费插件。
- 两个目录均提供 `subscribe(listener)`，返回取消函数，插件关闭时自动释放。连接或预设变更通知 modelProviders，提供方增删通知 usageProviders；消费者按需清理自己的状态。

前端消费通过插件自行声明的具型调用和事件连接其后台服务。内置 `usage` 模块拥有查询、缓存、刷新、展示状态及 toolbar，与 `providers` 提供模块分开；第三方 dashboard 可以独立遍历连接和用量目录，采用自己的策略，不依赖内置 toolbar 或会话。

连接配置与结果语义见 [账户用量](model-configuration.md#账户用量)，作者示例见 [`provider-usage.ts`](../packages/sdk/examples/provider-usage.ts)。

模型调用的通用响应元信息见 [响应元信息](runtime.md#响应元信息)。调用插件自行决定是否交给用量实现；模型机制不引用用量目录。作者示例见 [`provider-usage-headers.ts`](../packages/sdk/examples/provider-usage-headers.ts) 与 [`consume-usage.ts`](../packages/sdk/examples/consume-usage.ts)。

headers 来源需要消费者持有自己的模型调用结果，因此自然用于 Agent 等发起模型请求的插件；不按插件类别额外设门禁。仅遍历连接的 dashboard 可主动消费 query 来源，目录不会向它提供其他插件的响应头或已有用量状态。

## 网络提供方与服务（API 18.0）

`ModuleContribution.webProviders` 注册 `WebProviderDefinition`；`plugin.webProviders` 提供类型目录、已添加配置与实例解析，`plugin.web` 提供统一搜索与 URL 获取。类型工厂同步返回实现，异步方法接收调用信号；宿主将解析与执行绑定到提供方和调用方生命周期。配置与调用结果契约见 [Web 资源](web.md)，作者示例见 [`web-provider.ts`](../packages/sdk/examples/web-provider.ts)。

## 公共模块与契约身份

插件通过 `package.json` 的 `exports["./public"]` 导出愿意共享的契约、配置访问接口、服务或状态，消费者在依赖中声明提供方包并使用 `import { ... } from "<包名>/public"`。

内置插件由 `@asterism/builtin` 实现，稳定身份为 `asterism.builtin`；独立 `@asterism/builtin-api` 提供公共契约／领域接口，内置实现和外部插件共同消费。公共包不依赖实现，也不注册第二个插件。纯声明从 `/contracts` 导出，Agent 创建入口从仅后台可用的 `/runtime` 导出，Agent 界面扩展从仅前端可用的 `/renderer` 导出。Agent UI 的登记、呈现位置和输入区控制均归内置插件，SDK 不设跨资源的通用槽位。作者入口与当前导出见 [内置公共 API](../packages/builtin-api/README.md)。

内置实现保持静态构建，由应用组合层向通用公共模块机制登记包名、semver 版本、实现提供方插件 ID、按运行环境划分的明确子入口与导出名。应用在各环境绑定实际导出；外部构建按导入文件所属 npm 包检查依赖声明、npm semver 范围与环境出口，再生成指向已绑定导出的转接模块，不从消费者私有安装取另一份源码。没有插件清单的中间 npm 库按自身依赖声明校验，运行依赖仍归承载它的插件。未声明依赖、不兼容版本、重复提供方和未公开入口明确失败；不将内置 API 加入免校验的宿主库白名单。公共包版本与宿主 SDK API 版本独立校验。

公共导出采用稳定声明对象、函数或服务对象；运行状态通过方法读取，不以可重新赋值的模块变量作为转接协议。作者预先打包时须保留公共包导入。取得声明不表示实现已可用，也不授予资源访问权限：公共依赖关联真实实现插件，初始化失败传播到依赖者。前端按公共依赖顺序导入并登记视图，导入与视图登记失败阻止消费者装配。
宿主在每个运行环境（后台、前端分别独立）中统一构建启用插件的 ESM 模块图，保证提供方自身与所有消费者引用同一次模块执行的**真实导出实例**（含 re-export）。消费者要绑定同一个工具或动作契约，必须取得同一个声明对象；复制声明并保留相同 ID 不构成共享。稳定标识仅用于寻址、持久化及跨进程关联；不同声明占用同一契约身份、公共依赖缺失或存在循环初始化依赖时明确报错。

运行期服务的初始化和清理由提供方负责：宿主依据公共导入关系先初始化提供方、再初始化消费者；关闭时先等待托管工作收束，再按反向依赖顺序清理。

## 瞬态事件与插件调用

事件总线在宿主管理的全局通信机制中提供具名、有归属、具型的瞬态投递。插件、模块与应用外壳共用寻址空间，不按会话或模块分割，不写时间线、不构成模型上下文、不移动执行游标。机制遵循「信任插件，暴露问题」，不设配额、溢出丢弃或公平调度。

### 事件契约、来源与投递语义

事件在纯契约入口以 `ns.event(name, { schema, source, semantics })` 声明，通过 `ModuleContribution.events` 登记。`source` 可取 `plugin / resource / any`（`host` 仅用于软件自身发布的公共契约，信封 `source` 为 null）。公开事件信封包含 `contract: { id }`、`emittedAt`、`source: { plugin, resource }` 与具型 `data`。`plugin.ipc.events.publish` 发布插件级事件（`resource: null`），`object.events.publish` 绑定经校验的资源来源 `ResourceRef`。

| 契约语义 | 含义 | 消费方式 |
| --- | --- | --- |
| `occurrence` | 每次发生有独立意义（如资源通知），不允许替代 | `all`（按受理顺序逐条消费） |
| `snapshot` | 同键的新值完整替代旧值（如当前进度），声明顶层标量 `key` 字段（空数组表示按来源保持一个值） | `all` 或 `latest`（替换接收端队列中尚未消费的同键值） |

- **非事务与按序消费**：`publish` 只做校验、打戳与路由，立即入队并返回，不参与事务回滚（需对应已生效变化时在提交成功后发布）。每个订阅串行等待自己的异步 handler，失败或断连只结束该订阅。
- **生命周期与恢复**：后台在 `setup` 中订阅，前端在 `prepare({ events })` 或组件 `useRendererEvents()` 中订阅。取消订阅停止新投递并传取消信号，宿主等待运行中的回调真实结束后释放设施。总线不保留供晚订阅读取的状态，断连不补发；需要当前值的消费者先订阅再读取领域当前值。
- **宿主公共事件**：`@asterism/sdk/contracts` 导出 `SessionTitleChanged`（`asterism/session-title`，最外层提交后实际标题变化时发布）与 `ResourceStatusChanged`（`asterism/resource-status`，资源级 snapshot，发布 `running / failed / awaiting / completed` 及可选 `progress`，外壳消费规则见 [工作台](workbench.md#会话列表状态与资源通知)）。
- `ResourcePresenceChanged`（API 14.1，`asterism/resource-presence`）为宿主发布的 occurrence，携带 `sessionId / appeared / disappeared` 资源 ID 集合；跨会话界面据此释放已消失对象的状态标记。后台资源实例使用下述具型存在性观察。

### 具型插件调用

`defineCall` 声明具型请求、结果与调用作用域，后台用 `implementCall(contract, handler)` 经插件级装配或 `ModuleContribution.calls` 注册。契约归贡献插件所有，重复注册明确失败；后台消费者必须引用同一声明实例，跨进程按稳定 ID 路由。输入在后台按声明校验，输出在后台验证后通过 JSON 交付，消费者解码，不跨进程传递函数或服务实例。

前端插件及模块的 `prepare` 上下文提供 `calls`（API 14.1），与组件中的 `useRendererCalls()` 消费同一调用机制；调用信号绑定准备作用域。可据此建立独立于卡片挂载的前端服务，初始化／释放仍由插件生命周期负责。

后台 `plugin.ipc.calls.invoke(...)` 与前端 `useRendererCalls().invoke(...)` 使用同一具型调用机制。调用契约明确声明作用域：

- **插件级调用**：供设置保存、账号登录、连接测试等全局业务使用，不要求会话或资源引用，处理器不取得隐含对象门面。
- **对象级调用**：调用时提供完整 `ResourceRef`，宿主校验真实会话、类型及当前路径存在性，处理器取得只读 `object`。对象级契约不能通过省略对象降级为插件级调用。

两类处理器均取得 `signal` 和宿主绑定的 `source`：后台调用来源为调用插件，桌面调用来源为 null。调用作用域不改变数据归属，不开放其他插件的对象私有状态或写权限；插件可用自己的业务服务管理交互。插件级调用参与插件关闭与连接断开的取消和真实收束，不计入任何对象的执行状态。

调用独立于对象动作队列，等待中的工具不阻塞答案提交。宿主登记调用活动、传播取消并等待处理器实际结束，不设置默认超时，也不自动重放请求。前端卸载可取消其读取或订阅；连接断开、页面导航和插件关闭清理对应调用。取消通信调用不会自动取消业务服务中独立存在的工具等待。当前值由领域查询提供，变化通过事件通知；前端先订阅再读取当前值，收到通知后再次读取，直接采用每次返回的结果。

### 对象级双工通道（API 15.0）

高频、持续的对象数据（屏幕、音频、交互输入）使用对象级双工通道，不经会话投影或具型调用。`defineChannel<Up, Down>(id)` 声明契约，`Up` 为前端发往后台的消息、`Down` 为后台发往前端的消息；载荷为结构化克隆可传递的 JSON 值与 `Uint8Array`，可互相嵌套，宿主不逐帧校验，需要时由插件自行校验。

- **打开与路由**：前端以 `useRendererObject().openChannel(contract)` 打开；宿主校验对象位于当前路径且类型属于契约所属插件，再调用后台经 `ModuleContribution.channels` 登记的 `implementChannel(contract, channel => ...)`。处理器抛出 `PluginApiError` 时通道以 `unavailable` 结束。
- **两端接口**：后台 `ObjectChannel` 提供只读 `object`、`signal`、`send`、`onMessage`、`close`；前端 `RendererChannel` 提供 `send`、`onMessage`、`close` 与 `closed`。两端消息按发送顺序交付，不逐帧确认；监听注册前到达的消息先缓存，首个监听注册时按序补交。流量控制按需在插件协议中实现。
- **结束**：任一端关闭（`closed`）、对象离开当前集合（`removed`，含移除与回溯）、契约或插件不可用（`unavailable`）以及直连断开（`disconnected`）都会结束通道；后台 `signal` 以 `ChannelEnd` 为原因中止，前端 `closed` 兑现同一原因。通道不写历史，不占用时间线，也不计入对象执行状态。

## 数据兼容

历史记录、资源数据与工具结果等契约载荷不要求手填数据版本。宿主按资源、记录、实现或数据的稳定 ID 找到对应消费方，实际兼容性由其 schema 解码决定；兼容旧数据继续读取（插件可用 union/transform 转换旧形状，读取不改写原始存储），不能解码时返回 `unknown`、不可用或回退默认视图并保留原始数据。插件自有持久文件的格式升级见下节存储准备。宿主 SDK、IPC 与数据库的格式版本独立维护。

### 插件存储准备（API 18.2）

插件清单 `asterism.storage` 指向一个存储入口，默认导出 `defineStorage([...])`，条目类型为 `PluginStorageDeclaration`。宿主在插件运行时之前单独构建并导入该入口，与后台入口同属 runtime 构建；入口只声明格式，不导入插件业务模块。

- `path` 相对于 `extensions/<pluginId>/`，必须位于插件目录内。
- 声明只有 `kind`（`json` 或 `sqlite`）、`version`（正整数）与 `migrations`。迁移键 n 将第 n 版转换为第 n+1 版；JSON 步骤接收并返回正文，SQLite 步骤在宿主事务内对传入连接执行同步 SQL，连接、提交与 `user_version` 归宿主管理。
- 准备阶段只读取版本号：文件不存在或已是当前版本时不做任何事，版本落后时执行整条链，版本缺失或高于声明时停用该插件。
- 版本由写入方盖章。JSON 持久形状为 `{ version, data }` 信封，插件自管 JSON 写入时自行包上信封；托管配置使用 `.asterism/config.json` 路径声明时，`plugin.config` 在读写边界处理信封，插件及前端仍消费原配置值，信封版本不符时按配置无效回退默认值。托管数据库对应 `.asterism/db.sqlite`，首次打开时宿主写入声明版本；自管 SQLite 由插件自行设置 `user_version`。
- 存储准备失败的插件本次启动不进入 `setup`，首页提示失败原因，下次启动重试；宿主与其他插件不受影响。

宿主统一提供恢复点与恢复视图，完整生命周期见 [数据准备与迁移](architecture.md#数据准备与迁移)。可编译示例见 [`storage.ts`](../packages/sdk/examples/storage.ts)。

## 对象读取、执行与时间线查询

| 接口 | 能力 |
| --- | --- |
| `SessionReader` | 会话身份、固定观察快照 `snapshot()`、当前会话数据读取 `get()`、标题读取 |
| `SessionExecutor` | 读取能力 + 同步提交 `commit(writer => ...)`（当前数据 `set` 与当前时间线 `append`）+ 标题覆盖 `title.set` + 会话内 `create / invoke / link / unlink / remove` |
| `ObjectReader` | 资源身份、调用绑定的资源快照 `snapshot()`、当前对象数据读取 `get()`、只读 `session` |
| `ObjectExecutor` | 读取能力 + 对象同步提交 `commit`、可执行 `session`、时间线占用 `withBusy`、投影通知 `invalidate` |
| `ToolSession` | 只读会话能力 + 自动链接给执行者且可附带初始资源链接的 `create` + 本请求有效链接范围内的 `remove`；随工具调用结束失效 |

资源 `project / inspect / context / links.tools`、动作准备与外部准备者只接收只读门面；创建、动作执行和已授权工具执行接收执行门面（工具执行结束后修改与流发布能力失效）。

- **同步提交**：`commit` 回调必须同步完成（返回 Promise 导致回滚），嵌套同会话提交加入外层事务，通知仅在最外层提交成功后派发。`writer.append(contract, data)` 始终向提交时的当前时间线末端追加并原子推进游标。
- **按需观察快照与查询范围**：`snapshot()` 构造时只捕获时间线末端、会话追加上界和标题，不预先物化历史。`records.all / query / first / last` 支持两个 `scope`：
  - `timeline`：读取从根到快照末端的完整线性祖先路径（按根到末端排序）。
  - `session`：读取快照上界内包含所有分支的全会话记录（按进入会话的保存顺序 `sequence` 从 1 排序）。
  `first / last` 只解码目标首尾记录（损坏不跳过，返回 `unknown`）。
- **记录提交与游标观察（`SessionObserver`）**：在原事务提交后同步排队执行，失败记日志、不回滚原提交：
  - `committed({ records, snapshot, session })`：仅在新记录提交时调用，交付本批新增记录。
  - `cursorChanged({ snapshot, session })`：仅在提交前后执行游标改变时调用（正常追加、回溯与分叉选择统一为此入口，一次外层事务只通知最终位置）。依赖历史的派生当前值（如会话标题）在此重建。

资源贡献可声明同步 `disposalWarning(data, object): UiText | null`（API 14.1），提供结束当前外部实例前的用户提示。宿主不把它写入工作台投影：移除、回溯与归档确认框打开时经会话命令 `disposal.warnings` 查询（省略对象列表即取会话当前全部对象），软件退出时由主进程读取当前提示。它不作为后台移除授权或收束门禁。类型和模型工具声明保持静态，资源提供方自行定义外部实例的初始化策略。

### 生命周期作用域

`Lifetime { signal, defer(cleanup) }`（API 17.0）是插件清理的唯一机制：作用域结束时先中止 `signal`，再按登记逆序等待全部清理；单个清理失败只记录日志。作用域结束后再登记抛出 `unavailable`。宿主维护三层作用域，清理统一归结为结束某一层：

| 层级 | 结束时机 | 插件入口 |
| --- | --- | --- |
| 应用 | 插件装配失败或软件退出；`signal` 在开始关闭时即中止，清理在在途工作与全部对象作用域收束后执行 | `plugin.lifetime` |
| 会话 | 会话归档或软件退出；宿主内部层级，结束其下全部对象作用域 | 不暴露 |
| 对象 | 对象离开当前集合（移除、游标移走）、所属会话归档或软件退出 | `implementResource({ attach(data, object, lifetime) })` |

- **应用级**：连接池、配置订阅、公共领域登记等插件共享服务挂在 `plugin.lifetime`。需要在中止时立即撤下的公共登记监听 `lifetime.signal`；`defer` 用于等待式清理。根入口先于模块登记，逆序清理使模块先于根服务释放。
- **对象级**：对象进入当前集合时（启动、创建、恢复、回溯使其重新出现）宿主同步调用 `attach`，对象独占的外部实例（如终端进程）向 `lifetime` 登记清理。结束对象作用域时宿主先取消绑定在该对象上的运行并等待收束，再执行清理。共享对象只在此登记／注销引用，共享实例仍挂在应用级，不随单个会话结束。
- **统一清理**：退出与归档走同一路径，资源随时可被清理，不设阻拦；外部实例丢失的后果由 `disposalWarning` 在确认前呈现。恢复会话时对象重新 `attach`，与软件重启后相同，不自动恢复已结束的外部实例。
- 前端资源存在性仍由公共事件 `ResourcePresenceChanged` 交付，供界面释放状态标记，不承担后台释放职责。

## 具型创建、动作与准备管线

- **契约与实现**：在纯契约入口用 `defineCreation(resource, { id, schema })` 与 `defineAction(resource, { id, schema })` 声明；后台用 `implementCreation`、`implementAction` 与 `implementResource` 内联聚合，外部准备者用 `implementPreparer(ActionContract, ...)` 绑定具体动作；前端用 `session.create(CreationContract, input, position)` 与 `object.invoke(ActionContract, input)` 调用。
- **调用输入**：按契约调用的操作身份由契约单独确定，输入只承载业务参数；每个契约独立声明 schema。业务联合中的判别字段表达数据自身的分型，跨进程信封中的路由身份属于传输层，两者与重复声明操作名的输入字段分别处理。
- **五步输入处理次序**：
  1. 按资源所有者注册的 schema 解析原始输入一次（支持默认值、trim、transform，输入与输出均须为 JSON 值）。
  2. 动作按装配顺序执行匹配的外部准备者（只读门面）。
  3. 执行资源自身准备。准备均返回 `accept`（沿用解析结果）、`replace`（提供新原始输入并立即由所有者 schema 重新解析一次；不能替换动作身份）或 `reject`（终止处理，可选携带 `display: UiText`）。
  4. 将解析结果交给对象队列，执行层直接使用，不再重复解析；执行前再次检查真实对象和当前路径有效性。
  5. 创建在准备成功后进入宿主事务，同步返回 `{ title, data }` 并写入创建事件。

### 会话目录与资源操作（API 9.1）

`SessionExecutor` 与 `ToolSession` 指向同一会话，分别提供会话层面的通用操作与工具调用发起者视角下的操作。`ToolSession` 由宿主绑定发起资源、本次请求开始时的有效链接范围和工具执行作用域，使工具作者直接从当前发起资源出发组织操作，身份解析、授权范围校验与取消处理由宿主统一完成。后续扩展 `ToolSession` 时，每项操作均明确由调用上下文隐式绑定的端点、可操作资源范围及执行作用域；需要调用者主动选择的关系通过显式参数表达。请求授权的取用时机见 [代理控制器与请求环境](runtime.md#代理控制器与请求环境)，现有操作语义如下。

- `plugin.sessions.list()` 返回活跃会话的 `{ id, title, createdAt }` 摘要，按创建时间从新到旧排列；不加载历史、不改变前端视图。`plugin.sessions.archived()` 返回回收站中的 `{ id, title, createdAt, archivedAt }`，按归档时间从新到旧排列。两者都不含的会话 ID 已被删除，插件据此清理自己按会话保存的数据，清理时机与方式由插件决定；`plugin.session(id)` 对归档会话视为不存在。`SessionDirectory` 在同一宿主运行实例内共享，生命周期与该实例一致；公共领域服务可据此隔离自己的登记。
- `plugin.session(id)` 取得指定会话的执行门面。`session.create(CreationContract, input, { signal?, content?, linkTo?, resources? })` 引用已装配的真实声明实例，允许调用其他插件公开的契约；输入由资源提供方校验和初始化，成功返回 `ResourceCreationResult`（API 10.2）：包含 `ResourceRef` 的全部字段及创建事务内捕获的通用 `title`，不返回资源私有数据或执行门面。标题由资源创建实现决定，创建输入是否含标题字段由各契约定义。`resources`（API 10.1）为新资源接收的初始 `ResourceRef` 列表。
- `create` 的异步准备参与调用插件及资源提供方的关闭收束。准备期间阻止会话游标回溯，提交时重验会话、执行作用域与初始链接的全部端点；失败或取消不提交创建。`linkTo / resources` 与身份、初始数据和创建事件同事务写入。后台位置使用[工作台空位规则](workbench.md#画布与对象卡片)，`linkTo` 提供就近放置的关联对象，调用者无需提供画布坐标。内容资格交接见 [不可变内容](content.md#临时占用与提交)。
- `session.link(receiver, resource)`、`session.unlink(receiver, resource)` 使用完整资源引用，校验双方属于当前会话和当前路径、类型一致且接收者支持链接。接收者的后台声明为 `ResourceContribution.links.receive`，前端静态描述通过 `ResourceDescription.receivesLinks` 表达同一资格；关系语义见 [资源链接](object-model.md#资源链接宿主公共关系)。`session.remove(resource)` 与前端共用宿主移除操作；对象生命周期语义见 [资源](object-model.md#resource可被操作的对象)。
- 顶层工具的 `context.session` 固定执行会话和发起对象，`create(contract, input, { resources?, exposeSelf? })` 自动将新资源链接给发起者，返回同一 `ResourceCreationResult`；可选 `resources`（API 10.1）接收本请求有效链接范围内的资源 ID。`exposeSelf`（API 11.2）省略为 `false`，为 `true` 时由宿主将绑定的发起者作为新资源接收的初始资源，与创建及全部链接原子提交；接收资格与端点校验沿用同一创建管线。`remove(resourceId)` 采用本请求有效链接范围，并在提交时验证当前存在性与收束。模型创建的完整规则见 [Agent 创建与移除](runtime.md#agent-创建与移除)。普通 `ObjectReader.session` 仍为只读。
- `plugin.lifetime.signal` 在装配失败或开始关闭时中止；中止不代表活动已结束。宿主保留在途执行所需的提交设施，等待其真实收束后才释放，不因该信号提前阻断最终记录保存。

### 后台资源动作（API 11.1）

`SessionExecutor.invoke(ActionContract, target: ResourceRef, input, { signal?, content? })` 由调用插件发起后台资源动作，返回 `Promise<void>`。契约须为目标资源已注册的真实声明实例；目标须属于绑定会话且仍在当前路径上，声明副本、类型不匹配及已移除资源明确失败。公开契约提供调用入口，目标的私有数据与提交门面继续由资源提供方持有；`plugin.object(...)` 的归属校验保持不变。

- **处理与结果**：复用前端动作的 schema、外部准备者、资源准备与对象串行队列；执行前和首次提交时重验目标。返回表示动作处理完成，错误通过 `PluginApiError` 交付，领域原因和展示文案保留。由动作启动的独立托管任务遵循资源自己的契约，例如 Agent 提交返回只表示输入已受理。
- **取消与收束**：`signal` 贯穿准备、排队与动作处理器。取消排队项使其轮到执行时直接结束；已执行动作协作式处理取消，宿主等待真实结束后释放内容。调用方的整次操作以及提供方的准备／执行均参与运行生命周期，期间阻止相关资源移除和会话游标回溯。准备期限只约束准备阶段，完成准备后清除计时；动作没有默认执行超时。
- **附件交接**：`content` 为调用插件取得的合法读取门面，省略时使用调用位置绑定的会话／对象内容。首次异步等待前独立保留输入引用，规则见 [临时占用与提交](content.md#临时占用与提交)。指定目标不授予读取其私有附件的资格。
- **动作重入**：当前动作调用链仍在执行同一目标时，新的调用在准备前返回 `conflict`，避免等待排在自己之后的动作。动作结束后，其异步后续可再次调用该对象。资源内部的同步复用通过普通函数完成。
- **能力门面**：此入口属于后台执行门面；`ObjectReader.session` 与工具受约束的 `ToolSession` 保持各自声明的能力。动作调用不自动作为模型工具暴露，前端继续使用绑定对象的 `object.invoke`。

## 宿主运行生命周期

托管任务（`plugin.tasks.start`，按 key 去重、仅显式传入 `timeoutMs` 时设置期限）、资源动作（按对象排队）、插件调用、顶层工具和模型调用（同对象互斥、固定请求环境与工具批次）组合使用同一个宿主内部运行生命周期模块。它统一负责关闭门禁、插件／会话／对象关联、取消传播、真实结束等待与写入活动汇总。

**资源 busy** 只表示后台仍有依赖当前时间线路径的工作。宿主按资源身份汇总占用，任何资源 busy 时拒绝会话回溯，目标资源 busy 时拒绝移除；正常追加及无关对象操作继续允许。资源自己的业务状态和界面表达由资源管理，宿主不依据资源类型推断运行状态。

- `object.withBusy(work, { signal? })`（API 12.0）在调用工作前登记占用，传入宿主取消信号，工作真实结束后自动释放；嵌套与重叠占用独立计数。后台资源可用它保护自有异步写入过程。
- 资源动作从异步准备、排队到提交及内容交接结束自动占用目标资源；显式绑定对象的托管任务、模型请求和工具执行沿用宿主占用。同步事务内的写入由单一写入者保证原子性。
- 创建准备期间资源尚无身份，由创建管线持有临时的会话时间线占用；创建及后台交接结束后释放，不等待前端读取与渲染。
- 具型通信调用本身仅参与取消与插件关闭收束，关联只读对象也不自动标记 busy；处理器启动的资源动作、任务或显式 `withBusy` 由各自工作登记占用。
- `object.invalidate()` 让宿主交付该资源的当前投影，用于内存中的领域状态变化；它不保存数据、追加历史或让整个会话失效。提交内调用随事务成功后交付，回滚不通知。资源数据提交自动交付自身投影，插件需要更新其他依赖资源时显式通知对应对象。

前端 `object.view` 只提供当前视图可用性、读取异常与对象缺失信息。`object.invoke`（API 13.0）在动作处理完成后返回结果，不附带读取或等待会话同步；提交产生的当前数据更新由后台通道直接交付。按钮或表单自行维护调用期间的 pending 并阻止重入，普通调用不改变整个会话的可用性。界面状态见 [工作台状态反馈](workbench.md#工作台状态反馈)。

取消信号不等于工作已经结束；会话回溯、资源移除和插件关闭清理均等待真实收束。插件级装配与每个成功返回的模块 `setup` 均立即登记清理责任，后续装配失败或正常关闭时先取消托管工作并等待收束，再按初始化逆序执行清理。依赖共享服务的模块先清理，共享服务后释放；插件级准备与服务生命周期不随设置页面挂载或卸载而开始、结束。

## 插件配置与界面本地化

- **插件自有设置页面**：插件可在前端插件入口提供设置页面，自行组织分组、子页、草稿、保存及业务操作；宿主负责承载、导航与页面异常展示，不根据配置 schema 自动生成表单。页面关闭释放组件与页面订阅，不替代插件级服务关闭。设置页登记与托管配置登记相互独立。
- **打开设置**：宿主提供按插件身份打开设置页面的导航能力，卡片入口和插件界面内的“打开设置”操作进入同一个页面，可定位插件声明的内部位置。该能力不要求当前会话或资源，不构成资源授权。界面入口与管理行为见 [设置总览与插件管理](workbench.md#设置总览与插件管理)。
- **插件浮岛（API 15.1）**：设置页可在其所在浮岛右侧打开更深的浮岛，浮岛内可继续打开。插件提供插件内唯一的浮岛身份、无障碍名称、打开它的元素与内容；宽度、位置、动效、焦点与外框由宿主统一，身份按插件隔离，同一身份再次打开时替换内容而保留组件状态。面板外框由宿主绘制，插件声明标题、说明、标题栏主操作、工具区与是否有未保存修改；有未保存修改时，关闭、上级关闭或替换先由宿主确认放弃。插件也可注册自己的关闭守卫。浮岛内容在宿主屏内渲染，宿主为其重新提供插件偏好、随浮岛卸载取消的通信作用域与异常边界；设置页卸载时关闭它打开的浮岛。SDK 只声明契约与 hooks，外框实现由宿主注入，规则见 [浮岛编织](design-system.md#浮岛编织)。
- **可选托管配置**：采用托管配置的插件在纯契约中以 `ns.config(schema, defaults)` 声明一份配置契约，保存在 `<data>/extensions/<pluginId>/.asterism/config.json`。后台通过 `plugin.config(contract)` 取得 `get / update / subscribe`；前端 `useRendererConfig` 读取值，`useRendererConfiguration` 提供值、状态、就绪与错误信息及 `save / reset / refresh`，写入仍由后台按原始 schema 校验。宿主负责原子存储、校验及前后台变更通知；插件决定何时保存及如何响应变化。配置契约不携带自动表单布局职责。
- **私有业务数据**：插件也可自行维护配置与数据，在自有目录选择文件、数据库等持久化方式，负责业务同步；需要随版本升级的文件通过[存储准备](#插件存储准备api-182)声明迁移。托管 SQLite 按需打开，不使用时不创建数据库；托管配置、私有存储与凭据服务可独立选用。自管数据不替代宿主拥有的资源身份、授权、会话历史与内容引用契约。
- **界面偏好**：`useRendererPreferences` 存于 `ui-state.json` 的 `plugin/<pluginId>/` 下，不属于配置。
- **可选界面本地化**：公共展示字段接受 `UiText`（普通字符串或 `ns.messages(sourceLocale, defineMessages(...))` 声明的具归属消息描述），前端组件通过 `useI18n()` 格式化。完整规范见 [公共 i18n](i18n.md)。

## 前端视图与扩展入口

- **卡片几何声明（API 18.1）**：`CardAppearance` 由 `contracts` 导出，renderer 同名导出同一类型；包含画布单位的默认 `width / height` 与可选 `minWidth / minHeight`。资源模块在纯共享文件声明一份几何数据，交给后台 `implementResource(..., { card })`、前端 `ResourceDescription.card` 与 `cardRenderer`。后台放置与前端呈现按同一规则应用尺寸下限和用户覆盖；后台没有几何声明时使用公共默认尺寸。几何声明不进入资源数据或任务历史。作者用例见 `packages/sdk/examples/counter-contract.ts`、`author.ts` 与 `renderer.ts`。
- **资源展示目录（API 10.2）**：`useRendererResources()` 提供静态只读目录，`list()` 返回已装配的 `ResourceDescription[]`，`get(kind)` 返回对应描述；未知类型复用宿主的缺失资源名称和图标。目录与宿主卡片外壳共用登记，不解析实例正文，不授予资源授权。`label` 保留原插件的 `UiText` 消息归属，由消费组件在 render 中按当前语言格式化，图标保持前端节点。模型创建入口与资源类型的关联由内置公共领域 API 提供，见 [Agent 创建入口](../packages/builtin-api/README.md#agent-创建入口)。
- **内置 Agent 界面扩展**：内置插件和第三方通过公共 API 的 `agentUI.register` 在 renderer `prepare` 中登记组件，绑定准备作用域的 `signal`；失败、超时和退出释放登记。每张挂载的 Agent 卡片分别挂载贡献组件，按登记顺序呈现；重复贡献 ID 明确失败。组件通过 SDK 对象 hook 取得当前关联 Agent，偏好按贡献 ID 的插件命名空间绑定，配置仍按自有契约读取；不授予额外资源权限或私有状态访问。`AgentToolbarItem / AgentOverlay / AgentModal` 是内置领域的呈现接口，`AgentScrollArea` 提供 overlay／modal 共用的标准滚动区；业务显示状态、数据来源及工具等待由贡献者拥有。作者接口见 [内置公共 API](../packages/builtin-api/README.md#agent-界面扩展)，交互见 [Agent 扩展界面](workbench.md#agent-扩展界面)。
- **Agent 当前模型选择**：`useAgentModelSelection()` 在关联 Agent 的前端范围内提供只读快照：`selection` 为原始选择，`reference / model / thinking` 为当前目录解析结果。Agent 选择或目录改变时同步更新，内置配置摘要与上下文占用消费同一结果；原始选择中的继承空值不回填。它表达下一次请求取用的当前选择，不表示运行中的响应已经切换。

  缺少选择或目录时解析字段为 null；引用失效时 `model` 为 null，保留可解析的 `reference` 与思考选择。等级的继承、展示与发送遵循[模型配置](model-configuration.md#输入能力与思考等级)。接口仅供读取，内容限于当前选择，不包含凭据或 Agent 的其他私有状态；在 Agent 范围之外调用明确报错。
- **卡片辅助面板（API 8.2）**：`cardRenderer` 可选声明 `panels: [{ id, label, icon, Body }]`。ID 在该卡片 renderer 内唯一、非空且无首尾空白，不要求全局命名空间。面板 `Body` 与主体收到同一份通过契约校验的投影，并共享绑定对象与宿主服务；解析阶段只交付元素，不执行面板组件。`useRendererCard()` 提供当前 `activePanel`、`openPanel(id)` 与 `closePanel()`，供主体、操作区与面板内容使用；打开未知 ID 明确报错。宿主通过 `RendererCardProvider` 注入每张卡片独立的视图控制，不扩展资源授权或运行时对象接口。未声明面板的既有 renderer 保持兼容。交互与生命周期见 [卡片辅助面板](workbench.md#卡片辅助面板)。
- **对象保留状态（API 8.7）**：`RendererObjectContext.retained` 提供 `get(key, create, release?)` 与 `discard(key)`，用于输入草稿等由用户产生、无法从投影重建的前端状态。同一对象同一 key 首次调用 `create`，之后返回同一实例，跨卡片重挂载、聚焦容器切换与会话视图释放保持；对象离开当前会话投影或显式 `discard` 时宿主调用一次 `release`（可返回 Promise），应用重启后不恢复。key 以插件 ID 为前缀，避免与同一对象上的其他贡献者冲突；某个 `release` 抛出或拒绝只记录错误，不影响其他条目。插件不再自建按会话／对象索引的模块级表。释放规则见 [会话视图生命周期](workbench.md#会话视图生命周期)。
- **工具三态视图（`toolRenderer`）**：声明平行可选的 `input / execution / result`，每阶段含可选 `headerRenderer / bodyRenderer`，可复用 `ToolRenderProps<D, T, A>` 联合类型。`input` 接收部分 JSON 与 `result: null`；`execution` 接收已校验参数与 running 产出；`result` 接收终结结局。视觉与连续性规范见 [界面设计系统](design-system.md#对话过程视图)。
- **工具流式预览声明（API 15.3）**：`input / execution` 使用 `ToolStreamingPhaseView<P>`，在正文 renderer 旁可声明纯函数 `streaming(props): boolean`，表示当次已有适合渐进预览的正文。输入判断消费部分 JSON，执行判断消费与正文相同的已解码参数和产出；helper 只在 input 或 executing 且提供 bodyRenderer 时求值，并将结果投影为 `ToolView.streaming`。自定义 `ToolRenderer.resolve` 可直接提供此布尔字段。未声明时为普通视图；ready 与 settled 阶段采用普通视图。正文的布局与滚动由插件实现，宿主按调用阶段消费声明，具体开合偏好与延迟规则见 [工具调用三态视图](workbench.md#工具调用三态视图)。
- **工具需要处理声明**：`execution` 使用 `ToolExecutionPhaseView<P>`，另可声明纯函数 `attention(props): boolean`，表示执行正文需要用户处理（例如作答）。helper 只在 executing 且提供 bodyRenderer 时求值，投影为 `ToolView.attention`；其他阶段恒为 false。宿主据此强制展开一次，不受流式偏好控制，开合规则见 [工具调用三态视图](workbench.md#工具调用三态视图)。
- **虚拟化与条目视图状态（API 15.2）**：代理对话时间线是虚拟列表，工具视图随滚动卸载与重新挂载，组件内状态在卸载时丢失；状态保持与虚拟化完备由视图实现方负责。`useRendererViewState(key, initial)` 读写当前条目内的一项视图状态，在时间线条目内随重新挂载恢复，在条目作用域外与组件状态相同；`key` 在条目内唯一，以插件 ID 为前缀，为 null 时只作组件状态。可从数据推导的内容（耗时、结果）直接从 props 推导；渲染开销大的派生结果由视图自行缓存；内容在首次渲染时占据最终尺寸，异步加载会在每次重新挂载时改变条目高度。列表所有者以 `RendererViewStateProvider` 为每个条目提供稳定的存储。
- **历史记录视图（`recordRenderer`）**：声明 `label(data, context, record)`（必填纯文本摘要）、可选 `icon` 与 `Row`。宿主历史面板据此展示第一行摘要，并由宿主只读 `record.source` 固定追加第二行来源说明。
- **创建入口（`creationEntry`）**：统一声明添加菜单（`triggers.menu`）与画布拖放／粘贴（`triggers.drop`，支持扩展名、MIME、目录、URL scheme、文本条件）入口，可选提供 `toInput(item, content)` 与 `InputView`。宿主创建协调器负责候选仲裁、跨插件路由记忆（`creation-route/v1/...`）、放置位置与提交。
- **前端准备（`prepare`）**：插件与功能模块可声明 `prepare({ events, signal })` 预加载本地语法／主题或建立全局事件订阅。插件根准备先于自己的模块；根准备失败阻止本插件和依赖方装配，模块准备失败只记日志。单次准备等待上限 10 秒，超时取消但保留真实收束责任；关闭先取消订阅与准备，等待在途事件处理器及原始准备 Promise 结束，再释放根服务。失败插件的清理同样参与应用关闭时的反向依赖顺序。
- **不可变内容与模型服务接口**：各阶段 `content` 门面（`read / open / stage`）的作用域矩阵见 [不可变内容](content.md)；`models.validate / stream / run` 的无状态模型调用接口见 [SDK 作者指南](../packages/sdk/README.md#可选模型分支)；`models.run` 结果附带的请求诊断（API 8.3）见 [运行时](runtime.md#请求诊断)。
