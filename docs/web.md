# Web 资源与提供方

本文定义 Web 资源、网络提供方类型与连接、URL 分派和统一结果。资源身份与链接沿用[对象模型](object-model.md)，工具执行、模型投影与历史沿用[运行时](runtime.md)，插件贡献沿用[插件 SDK](plugin-sdk.md)。

## 资源与工具

`WebResource` 是访问全应用网络提供方连接的资源入口；用户从添加菜单创建并链接给 Agent。多个 Web 对象共用连接配置，资源自身只保存身份与标题。卡片显示连接顺序、启用状态和搜索／获取能力，`resource_inspect` 返回连接身份与能力目录。

两个工具静态注册为只读、可并行的资源工具：

| 工具 | 输入与行为 |
| --- | --- |
| `web_search` | `query`、`maxResults`，以及可选的 `includeDomains / excludeDomains / publishedAfter / publishedBefore / language / region / provider`；显式 `provider` 选择连接，省略时取列表中首个启用且支持搜索的连接 |
| `web_fetch` | `url` 与可选摘录目标 `query`；按下节路由选定连接，取得可读内容与结构化信息 |

搜索日期采用 ISO 日期或带时区的日期时间，保留调用者精度；region 是两位大写国家代码。HTTP(S) URL 以 URL 解析规则校验，不包含内嵌用户名或密码。显式选择的搜索连接失效时报告错误，不改选其他连接。

## 类型、连接与实例

- **提供方类型**：插件通过 `ModuleContribution.webProviders` 贡献 `WebProviderDefinition`，声明目录 ID、可本地化名称、搜索／获取能力、多个 URL patterns、设置 schema、连接默认值、可选凭据获取页和同步 `create` 工厂。
- **连接**：用户在设置的「提供商 → 网络提供商」管理 ID、名称、类型引用、启用状态、端点、认证和类型自有设置。类型默认值只用于新建草稿；凭据独立加密保存，配置持有引用。连接按列表顺序持久化，可上下移动。
- **实例**：目录按连接 ID 解析，取用当前连接与凭据交给类型工厂；实例声明 `search / fetch` 方法，异步调用接收取消信号。已有实例保持解析时取得的配置，新的解析重新取用当前值。

类型身份全局唯一，重复登记拒绝加载；登记整体校验，插件失败或关闭时撤销贡献。关闭取消并等待提供方与消费者的真实工作收束。撤销后的旧句柄不能接管同 ID 的新实现。删除类型不删除已保存连接；失效引用在设置保留并显示不可用。

设置、IPC 与消费方使用网络连接的具名契约，不根据品牌或端点猜测类型。类型设置由提供方 schema 校验，公共设置页按 schema 编辑。服务注册与目录不保存调用结果。

## URL 分派

`web_fetch` 依次遍历已配置连接，跳过停用、类型不可用或不支持 fetch 的连接；对每个候选按其声明顺序遍历 `urlPatterns`，第一个命中确定实际连接。

Pattern 是完整 URL 的 glob：`*` 匹配任意字符，其余字符按字面匹配；匹配对象为 `new URL(url).href`。`*` 本身可作为列表末尾的通用匹配，机制不按 pattern 特异性排序。URL 的领域含义、参数与别名解析属于提供方实现。

无匹配时报告提供方不可用；已选连接的凭据或请求失败直接成为本次错误，不隐式改选连接。

## 统一请求与结果

SDK 的 `WebServices` 提供 `search / fetch`，`WebProviderServices` 提供 `types / list / get / resolve / subscribe`。服务负责选择、分派与公共结果校验，提供方适配协议并返回 `WebResponse`。

| 字段 | 语义 |
| --- | --- |
| `documents` | 有序来源列表；每项包含 URL、可选标题／作者／日期／媒体／链接／分数，以及 `content` 和可选 `details` |
| `content` | 明确区分 `snippet / excerpt / body / summary`，以 `text / markdown` 表达格式，实际截断可标注 `truncated` |
| `dates` | `published / modified / fetched / unknown` 日期；值保留上游精度，不补造日期种类与时区 |
| `details` | `Presentation[]`；提供方用 `DataContract` 声明具型领域数据，通过 `present` 校验后交付，来源与响应均可附带 |
| `hints` | `{ code, message, parameter? }`，说明未应用的条件、参数调整及其他实际执行差异；同时交给用户与模型 |
| `requestId / usage` | 上游请求身份与实报用量；数量、单位和可选币种明确分开，未报告时保持缺省 |

搜索结果另带实际查询与提供方身份，获取结果另带请求 URL 与提供方身份。身份使用当次连接的 ID、名称与类型。不同提供方的分数保持各自语义，不据此跨提供方重新排序。

具型领域数据与公共内容一同进入普通工具结果；模型投影序列化完整公共结果，包括 hints 与 details。前端使用统一内容视图，领域数据可展开读取。Hint 本身不强制改变工具结局；取消、明确失败沿用现有工具结局。

Web 不设响应缓存、独立结果库或额外读取工具。工具结果的保存、后续模型上下文与压缩均使用原有路径。插件自有缓存需求可自行使用其私有目录、SQLite 或内存状态，与 Web 服务契约独立。

## Exa

内置类型 `exa` 使用官方 `exa-js`，支持 search 和 fetch，URL patterns 为 `["*"]`。默认端点为 `https://api.exa.ai`，使用 API key。内置实现没有额外设置项。

- 搜索通过 `search` 请求 `auto` 搜索和相关摘录；映射数量、域名、发布日期与地区参数。超过 100 条时调为 100 并返回 hint；语言条件未应用时返回 hint。
- 获取通过 `getContents` 请求正文；传入 query 时附带相关摘录请求。关闭 SDK 的空内容结果过滤，以保留上游实际结果和状态。
- `text / highlights / summary` 分别转换为正文、摘录、摘要。作者、发布日期、分数与有效媒体链接进入公共字段；来源 ID、快照时间、实体及其他领域字段保留在 `ExaDocumentDetails`。
- 上游 warnings 和 notices 进入 hints，原始补充信息、费用分项、状态与其他响应字段保留在 `ExaResponseDetails`。总金额以 USD 实报用量交付，不重复累加费用分项。
- SDK 请求接收工具取消信号；空获取结果明确失败，成功空搜索是合法结果。API 失败按普通工具错误交付。

官方接口依据：[搜索](https://exa.ai/docs/reference/search)、[内容获取](https://exa.ai/docs/reference/get-contents)、[TypeScript SDK](https://github.com/exa-labs/exa-js)。
