# 配置模块实现说明

应用级配置与连接测试独立于工作台、任务历史和 renderer。公开传输契约在 `../shared/configuration.ts`，完整领域语义与覆盖规则见 [模型与代理配置](../../docs/model-configuration.md)。

## 文件职责

| 文件 | 职责 |
| --- | --- |
| `service.ts` | 配置命令队列、消费解析入口（`resolveProviderModel / resolveModelRole`）、凭据协调、后台模型发现、参数获取及异步连接测试；网络连接保存与凭据取用 |
| `store.ts` | `configuration.json` 的读写、覆盖归一化、连接固定字段与模型兼容编辑检查、完整候选文档 Zod 校验与临时文件重命名原子保存；不依赖数据库 |
| `layers.ts` | 内置原始定义、用户局部覆盖（`overrides`）与最终生效配置的纯函数解析；不依赖文件存储 |
| `defaults.ts` | 五种内置模型角色与五种内置 agent 的原始定义 |
| `credentials.ts` | `credentials/` 下密文文件的创建、读取、替换与清理；经 `runtime/secret-client.ts` 请求主进程 `safeStorage` 加解密 |
| `probe.ts` | 三种协议的显式 AI SDK 实例、最小连通性测试请求与脱敏错误分类 |
| `discovery.ts` | `GET /models` 列表请求、连接鉴权、游标分页、取消与 30 秒超时管理 |
| `discovery-format.ts` | 独立于消息协议，按响应结构识别模型目录并归一化已适配元数据；支持范围见 [模型发现与添加](../../docs/model-configuration.md#模型发现与添加) |
| `model-catalog.ts` | 调用官方 `@opencode-ai/models` 客户端，按剥离路由前缀后的模型名精确匹配并映射可覆盖参数 |
| `web-providers.ts` | 网络类型贡献、实例解析、按序 URL 匹配与公共结果校验；业务契约见 [Web 资源](../../docs/web.md) |
| `provider-extensions.ts` | 插件预设与用量提供方目录、原子登记、预设修改、失败撤销与绑定生命周期的调用句柄；不包含厂商实现或消费者状态 |
| `../shared/provider-presets.ts` | 插件提供的连接预设校验与配置／编辑规则的独立草稿生成（`modelProviderPresetDraft`）；内置目录位于 `packages/builtin/src/providers/presets.ts` |
| `../shared/model-compatibility.ts` | 预定义模型兼容包的 schema 声明与提供商／模型两层按 `id` 整项覆盖合并逻辑 |
| `errors.ts` | 配置模块的固定错误码分类 |

## 新增提供商预设

内置目录在 `packages/builtin/src/providers/presets.ts` 追加条目；外部插件通过 SDK `modelProviderPresets` 贡献新增或修改，无需修改选择器或运行时。公共形状与生命周期见 [提供商贡献](../../docs/plugin-sdk.md#提供商与用量目录api-100)：

- `id`：目录唯一身份及新连接默认 ID（按量用厂商 slug，订阅追加 `-plan`，地区后缀放最后，如 `kimi-plan-cn`）。
- `name / billing`：显示名称与 `usage | subscription | none` 计费分组。
- `region / plan`：可选地区与套餐说明（支持 `UiText`）。
- `connection`：`protocol | baseUrl | auth | compatibility | usage | fixedFields`（兼容条目须来自 `model-compatibility.ts` 已实现目录，无差异填 `[]`；优先使用 Responses，Anthropic 用 Messages）。编辑规则的语义见[连接编辑规则](../../docs/model-configuration.md#连接编辑规则)，目录可按连接需要声明部分固定项；编辑器与执行端不增加品牌分支。
- `keyUrl / sources / verifiedOn / keywords`：凭据获取页、非空官方核验资料链接、核对日期与搜索别名。
