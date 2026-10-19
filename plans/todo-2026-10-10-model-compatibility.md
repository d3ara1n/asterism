# 模型兼容包与标准思考等级

> 立案 2026-10-10。配置、标准等级、公共思考双通道、端点字段适配与等级／预算映射已实施；GUI 与真实端点待验收。跨模型续接共用请求投影，见 [续接计划](todo-2026-10-13-cross-model-continuation.md)。

## 已确认设计

- 明文、摘要、密文／签名续接属于内置能力。公共 thinking 必填 text、summary，原生资料保存在带来源的 continuation；摘要不填充明文，不从密文恢复文字。
- Responses 按原始 reasoning item 生命周期收束，全文与摘要分别累积；SDK 派生摘要事件不重复消费。Messages 思考文字进入 text。展示优先明文否则摘要，选择不写回历史。
- Responses 基线编码 content 数组、独立 summary 与可复用密文；Messages 基线编码无签名明文、签名原文与遮蔽块，独立摘要不转成 thinking。来源作用域／适配版本只限制原生资料复用，不能阻断公共内容。
- 兼容包是预定义、有限的端点差异声明，不是 processor，也不加载用户 patch。定义包含稳定 id、参数 schema、schema 原文名称／说明，以及独立的 appliesTo 协议／端点参考。
- appliesTo 只供展示，不用于自动启用、添加限制或运行时匹配。不按品牌、域名或模型名自动启用兼容行为；预设可以显式填入已核实的配置。
- 提供商与模型分别保存稀疏列表；按 id 合并，模型同名条目整项覆盖，不深合并参数。移除覆盖恢复提供商条目；模型空列表不禁用提供商项，无 false/null 墓碑。可选参数省略取包定义的协议基线，不继承被覆盖项的字段。
- UI 共用添加、编辑、移除与适用参考展示，参数编辑由 schema 驱动。连接编辑器不持有预设身份。
- 标准思考等级为 off/minimal/low/medium/high/xhigh/max；xhigh 与 max 独立。reasoning 为 true 时请求末端校验最终等级，false 过滤当次全部历史思考但不影响接收与保存；off 不触发历史过滤。
- 连接测试保持最小 probe，与执行共用传输和选项解释入口，不代替思考续接验收。

## 正式兼容目录

目录与各包规则统一维护在[模型兼容包](../docs/model-configuration.md#模型兼容包)，等级与预算的默认行为见[思考等级与预算映射](../docs/model-configuration.md#思考等级与预算映射)。

明文续接不需要 DeepSeek 专用开关。SDK 自动添加的密文 include 和默认摘要也须服从最终请求边界的字段设置。未支持的服务端输入由服务端反馈，不自动改写历史、切换协议或重试降级。

## 实现边界

- `src/shared/model-compatibility.ts` 承接定义、校验与合并；配置文件与 IPC 的当前版本分别以 `src/configuration/store.ts`、`src/shared/configuration.ts` 为准。
- SDK 0.15.0／宿主 API 8.1 声明 thinking 的独立 text、summary 及 summary delta，以及调用方 UA／会话归属；工作数据库版本 19。开发期不提供旧数据推断或迁移。
- `src/model/request-identity.ts` 解释身份兼容包，最终传输边界设置头；内置 Agent、命名与压缩提供应用 UA 和稳定会话 ID。连接测试沿用同一编码并生成临时 ID。
- `src/model/thinking-options.ts` 在请求级中间件中统一处理 effort 与手动预算，覆盖流式和非流式调用；通用 schema 表单支持稀疏映射及显式 null。
- `src/model/projection.ts` 从公共历史生成目标内容，`continuation.ts` 只判断原生资料可复用性。
- `src/model/responses-reasoning.ts`、`anthropic-thinking.ts` 通过 SDK 公开中间件固定思考顺序，再在传输入口核对普通消息／工具并编码思考；不修改依赖源码，不使用文本哨兵或通用 JSON patch。
- 原生签名对应文字不裁剪、不替换为摘要；跨来源清除不适用的签名、密文与原生 item ID，公共内容保持语义。
- SDK 内部的模型名推断仍属于依赖行为，不宣称本轮移除了全部 SDK 隐含规则。

## 提供商预设与核验

核验日期 2026-10-15；目录、资料与端点见 `src/shared/provider-presets.ts`。

- DeepSeek 的 Responses content 明文、Kimi 的 content／summary 与智谱的单对象 content 已按官方文档区分。Kimi 的低／高／最大等级由模型配置另行声明，预设不附带模型。
- Kimi 按量与 Kimi Code 分别声明国内／国际入口；智谱／Z.ai 也按地区与计费产品声明四项，共用 Responses 字段适配，即使地址相同也不混用凭据说明。
- 国内外 GLM-5.3 模型 API 文档都列出 Responses `/api/v1`，并说明曾订阅 Coding Plan（含已过期）的账户当前通过模型 API 调用时仅支持 Chat；不自动切换协议或计费产品。
- 订阅服务存在受支持客户端限制；预设不代表 Atelier 获得厂商准入，不伪装其他客户端。智谱／Z.ai 共用适配的字段依据国内详细 schema，国际页面提供协议与端点声明，真实地区端点仍须分别验收。
- 官方文档与合成协议测试不替代账户权限、真实模型多轮工具调用与 GUI 验收。

## 待办与验收

- [x] 公共思考的明文／摘要／不透明资料分离，贯通流、记录、投影与展示。
- [x] Responses 与 Messages 原生思考编码；兼容包只控制端点字段差异。
- [x] Kimi 与智谱／Z.ai 的已公布 Responses 产品预设、地区／套餐说明及凭据入口。
- [x] OpenRouter、OpenCode Console／Go 的单一 Responses 预设；UA 覆盖、Go 会话头及公开 SDK 请求身份传递。
- [ ] GUI 与真实 Go 端点：UA 添加／覆盖／移除、同会话正常对话及辅助调用、连接测试；Go 请求头功能待用户验收。
- [x] GUI：提供商卡片按计费方式分组、地区／套餐显示，用户于 2026-10-15 确认。
- [ ] GUI：兼容参数添加／编辑／移除、保存重开、模型覆盖及恢复；summary-only 与纯密文块展示。
- [ ] 真实端点：OpenAI、Anthropic、DeepSeek、Kimi 与智谱的多轮思考、工具配对与跨模型切回；分别确认套餐权限与客户端准入。
- [ ] 真实端点：分别确认智谱／Z.ai 四种地区与计费组合，核对共用 Responses 适配与账户历史订阅限制。
- [x] `customThinkingLevels`、`customThinkingBudgets` 与 Anthropic 内置预算映射；标准等级不回写，模式不由兼容包切换。
- [ ] GUI 与真实端点：等级映射的缺省／字符串／null、预算覆盖、保存重开和恢复提供商设置；Anthropic 手动预算与 adaptive 各验证一次真实请求，确认预算冲突提示及辅助调用的输出上限。
- [ ] 延后：确定模型专属兼容资料的来源与推荐入口；参数获取不消费目录 patch、不自动添加兼容包，见 [模型目录归档](archived/todo-2026-10-07-model-catalog.md)。

验证以实际 HTTP 正文、真实 SDK 解码与公共记录往返为边界，覆盖两通道分离、密文／签名原样续接、跨来源隔离、工具顺序及字段设置。真实服务与 GUI 由用户操作，未完成前不归档。

2026-10-15 验证：类型检查、73 个测试文件／489 项用例、i18n 检查与构建通过。回归包含空正文签名、Responses output_index 稳定归属、未闭合块仍交付终态计量，以及 SDK 末段正文裁剪。构建保留既有的 500 kB 产物大小提示；没有调用真实模型端点或操作真实开发数据。

2026-10-15 请求身份收尾验证：类型检查、全量 74 个测试文件／495 项用例、i18n 检查、兼容表单 schema 转换与构建通过；覆盖 UA 优先级、三协议最终 HTTP 头、Go 临时／稳定会话 ID、SDK 输入快照，以及内置 Agent、命名、压缩的身份传递。真实 Go 请求头与 GUI 仍待上述专项验收。

2026-10-19 等级与预算映射验证：类型检查、模型／配置／表单契约的 12 个测试文件／133 项用例、本地化抽取与检查、生产构建通过。真实 SDK 传输捕获覆盖三协议自定义 effort、显式省略、整项覆盖、默认与自定义预算、无输出配置时的固定上限、预算冲突拒绝、模式独立，以及流式／非流式和连接 probe；复核发现的 SDK 默认预算叠加问题已修正。构建保留既有产物体积提示。未访问真实提供商、操作 GUI 或修改真实开发数据。
