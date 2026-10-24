# Web 资源与提供方

本文定义 Web 资源、网络提供方类型与配置、URL 分派和统一结果。资源身份与链接沿用[对象模型](object-model.md)，工具执行、模型投影与历史沿用[运行时](runtime.md)，插件贡献沿用[插件 SDK](plugin-sdk.md)。

## 资源与工具

`WebResource` 是访问全应用网络提供方的资源入口；用户从添加菜单创建并链接给 Agent。所有会话中的所有 Web 资源对象共用同一后端，状态由全局网络提供方目录驱动，资源自身只保存身份与标题。卡片投影是否存在启用的提供方，以及所在会话在本次运行内的请求统计：`web_search` 与 `web_fetch` 按成功、失败、取消计数，另含进行中数量、平均与最近耗时、按币种汇总的实报费用和最近 5 条请求。统计只在后台内存中，软件重启清空、不写入资源数据；会话回溯不清零，已发生的请求与费用照常计入。`resource_inspect` 返回类型目录与能力。卡片界面见 [工作台](workbench.md#web-卡片)。

两个工具静态注册为只读、可并行的资源工具：

| 工具 | 输入与行为 |
| --- | --- |
| `web_search` | `query`、`maxResults` 及可选过滤参数；自动使用列表中首个已启用且支持搜索的提供方 |
| `web_fetch` | `url`、可选附加摘录目标 `query` 与正文上限 `maxCharacters`；按下节路由规则选定提供方，取得可读内容与结构化信息 |

搜索日期采用 ISO 日期或带时区的日期时间，保留调用者精度；region 是两位大写国家代码。HTTP(S) URL 以 URL 解析规则校验，不包含内嵌用户名或密码。

## 提供方类型与配置

插件通过 `ModuleContribution.webProviders` 贡献 `WebProviderDefinition`，声明目录 ID（slug）、可本地化名称、搜索／获取能力、URL patterns、默认端点、凭据类型声明和同步工厂。

**类型 slug 即身份**：网络提供方是具体服务而非可指向任意端点的连接。每种类型全局至多一份配置，id 即提供方硬编码的类型 slug（如 `exa`），用户不命名、不为同类型创建多份配置。删除类型不删除已保存配置，失效引用在设置中保留并显示不可用。

**凭据类型声明**：提供方通过 `credential` 字段声明所需凭据种类（当前支持 `api_key` 和 `null`）；UI 按类型渲染对应输入控件，不要求用户填写任意 JSON。凭据独立加密保存，配置持有引用。

**端点**：`defaultBaseUrl` 是提供方内部预设端点，注册表在调用工厂前统一去除尾斜杠；端点不对用户暴露，也不进入配置存储。自托管或代理部署需要独立提供方类型，而非覆盖现有类型的端点。

用户在设置的「提供商 → 网络提供商」只看到已添加的提供方：添加时从未添加的类型中选择并填写 API key；编辑时类型固定，只能更换密钥、切换启用或移除。类型身份全局唯一，重复登记拒绝加载；插件失败或关闭时撤销贡献，关闭等待在途工作收束。

## URL 分派

`web_fetch` 依次遍历已配置的启用提供方，对每个候选按声明顺序遍历 `urlPatterns`，第一个命中确定实际提供方。

Pattern 是完整 URL 的 glob：`*` 匹配任意字符，其余字符按字面匹配；匹配对象为 `new URL(url).href`。`*` 本身可作为列表末尾的通用匹配，机制不按 pattern 特异性排序。`web_search` 不支持此路由；搜索固定使用首个启用的搜索提供方。

无匹配时报告提供方不可用；失败直接成为本次工具错误，不隐式改选其他提供方。

## 调用机制

每次 `web_search` 或 `web_fetch` 调用，注册表在提供方的 `entry.runs` 作用域内完成凭据读取、实例创建与实际请求三个步骤，共用同一取消信号；session 层通过 `sessionRuns` 追加生命周期保护。`resolve()` 暴露给插件，急切创建实例并返回绑定生命周期的调用门面，供需要复用同一实例的场景使用。

## 统一请求与结果

SDK 的 `WebServices` 提供 `search / fetch`，`WebProviderServices` 提供 `types / list / get / resolve / subscribe`。服务负责选择、分派与公共结果校验，提供方适配协议并返回 `WebResponse`。

获取的 `query` 请求正文之外的相关摘录，提供方可据此产生额外费用。`maxCharacters` 为可选正整数，以 Unicode 码点计算每份文档全部 `body` 块共享的字符上限；摘录、摘要、元数据独立于正文预算。省略时沿用提供方默认行为。服务在公共结果校验后按内容顺序裁剪正文，统一应用于 `fetch` 与 `resolve().fetch`；提供方可将该参数映射给上游以减少传输量，其协议限制与调整说明留在适配层。

| 字段 | 语义 |
| --- | --- |
| `documents` | 有序来源列表；每项包含 URL、可选标题／作者／日期／媒体／链接／分数，以及 `content` 和可选 `details` |
| `content` | 明确区分 `snippet / excerpt / body / summary`，以 `text / markdown` 表达格式；服务实际裁剪的块标记 `truncated: true`，保留提供方已有标记；仅请求长度限制或内容恰好达到上限不构成截断证据 |
| `dates` | `published / modified / fetched / unknown` 日期；值保留上游精度，不补造日期种类与时区 |
| `details` | `Presentation[]`；提供方用 `DataContract` 声明具型领域数据，通过 `present` 校验后交付，来源与响应均可附带 |
| `hints` | `{ code, message, parameter? }`，说明未应用的条件、参数调整及其他实际执行差异；同时交给用户与模型 |
| `requestId / usage` | 上游请求身份与实报用量；数量、单位和可选币种明确分开，未报告时保持缺省 |

搜索结果另带实际查询与提供方 slug（`provider`），获取结果另带请求 URL 与提供方 slug。工具结果投影为 JSON Schema 交给模型，因此不含本地化文案。不同提供方的分数保持各自语义，不据此跨提供方重新排序。

Web 不设响应缓存。工具结果的保存、后续模型上下文与压缩均使用原有路径。插件自有缓存需求可自行使用私有 SQLite 或内存状态，与 Web 服务契约独立。

## Exa

内置类型 `exa` 使用官方 `exa-js`，支持 search 和 fetch，URL patterns 为 `["*"]`。内部端点为 `https://api.exa.ai`，使用 API key。

- 搜索通过 `search` 请求 `auto` 搜索和相关摘录；映射数量、域名、发布日期与地区参数。超过 100 条时调为 100 并返回 hint；语言条件未应用时返回 hint。
- 获取通过 `getContents` 请求正文；传入 query 时附带相关摘录请求。`maxCharacters` 映射到 `text.maxCharacters`，超过 Exa 的 1,000,000 字符上限时调至该值并返回 hint。关闭 SDK 的空内容结果过滤，以保留上游实际结果和状态。Exa 未报告实际截断时，适配层保持 `truncated` 缺省。
- `text / highlights / summary` 分别转换为正文、摘录、摘要。标题、作者、发布日期与媒体的空值或缺省值作为元数据缺失处理；有效值、分数与有效媒体链接进入公共字段。来源 ID、快照时间、实体及其他领域字段保留在 `ExaDocumentDetails`。
- 上游 warnings、notices 和非成功 statuses 进入 hints，原始状态、补充信息、费用分项与响应字段保留在 `ExaResponseDetails`。总金额以 USD 实报用量交付。
- SDK 请求接收工具取消信号；空获取结果明确失败，成功空搜索是合法结果。API 失败按普通工具错误交付。

官方接口依据：[搜索](https://exa.ai/docs/reference/search)、[内容获取](https://exa.ai/docs/reference/get-contents)、[TypeScript SDK](https://github.com/exa-labs/exa-js)。
