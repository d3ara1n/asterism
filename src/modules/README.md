# 功能模块

资源与工具在模型中平级；后端实现和对应 UI 在这里按功能共置。当前内置模块为 `notes/`、`filesystem/`、`agent/` 与提交后观察模块 `naming/`；命名只提供后台入口。

后台与视图通过 [公开 SDK](../../packages/sdk/README.md) 消费宿主能力，职责与组合约定见 [插件 SDK 与功能组合](../../docs/plugin-sdk.md)，迁移进度见 [插件计划](../../plans/todo-2026-10-12-plugin-system.md)。`setup` 是装配入口，业务模块用显式依赖组合；资源内联聚合具型创建与动作实现，工具使用 `implementTool`，命名使用提交后观察与托管任务，Agent 自己推动模型循环。

`shared/` 存放 core 模块共用的工具契约、正文 schema 与算法，不提供独立模块入口，不依赖宿主实现。纯契约可由后台与 renderer 共用，正文算法只进入后台依赖图。

## 三个入口

| 文件 | 职责 |
| --- | --- |
| `contract.ts` | 纯 Zod 契约：资源状态、卡片数据、工具实现的 target/result 和稳定 ID/版本；过程产出与终结 data 共用 result schema |
| `runtime.ts` | 默认导出 SDK 的 `defineModule(plugin => ...)`，提供资源、工具与具名生命周期贡献；可使用 Node |
| `renderer.tsx` | 默认导出 RendererModule，声明静态资源展示描述，注册卡片内容、附加操作和工具 header/body，只依赖纯契约与前端代码 |

`modules/plugin.ts` 声明内置插件 `atelier.core` 的命名空间，契约以 `core.resource` / `core.data` 短名声明并补全为 `atelier.core/<name>`；`modules/runtime.ts` 通过静态 glob 收集 SDK 模块，组成内置插件定义，经 `src/plugins/loader.ts` 两阶段装配，`modules/renderer.ts` 通过 Vite 静态 glob 收集视图入口。新增目录遵守入口约定即可进入构建；两个入口不要相互导入，也不要创建同时导出它们的 barrel。运行时不依赖 React，renderer 不导入 Node/数据库。外部插件包经 `src/plugins/packages.ts` 在启动时打包加载，与内置插件同一装配流程；不提供沙箱。

资源创建与卡片行为通过 `resource.create` / `resource.command` 接入，SDK 资源由宿主 adapter 将 `creation / actions` 接到控制器，校验输入并执行；没有对应行为时拒绝命令。模型操作入口和资源授权独立于这些内部应用命令。SDK 的创建输入错误与 prepare 的参数拒绝映为应用的 `invalid_request`。

## 工具契约与实现

工具通过 `defineTool({ name, description, guidelines, argsSchema })` 定义。`description` 说明能力与适用场景，供模型挑选；`guidelines` 说明选定后的使用规则、示例和跨工具配合，允许为空数组；`argsSchema` 固定操作参数及其含义。不另设 snippet。

`shared/declarations.ts` 是内置共享定义的位置，包含 `List / Read / Edit / Write`；`shared/text-contract.ts` 声明正文载荷，`shared/text.ts` 与 `shared/hashline/` 实现正文操作。模块可在自己的纯契约文件声明独特工具，也可导出给其他模块引用；多个模块共用的契约可抽到共享库，不必修改 Atelier 内置定义。相同工具复用同一份完整契约；用法或行为含义不同就定义另一工具，不在实现中覆写 description 或 guidelines。

一级宿主入口在 `tools/core.ts` 声明，同样使用 ToolContract 和 defineTool；`execution/core.ts` 固定装配执行器，不将入口注册到资源工具目录。`tools/definition.ts` 统一投影定义：一级入口将 guidelines 合入 provider 的 description，二级工具在链接说明与 inspect 中提供结构化 description、guidelines 和 args schema。注册与执行路径决定工具层级。

下面是一个可由多个模块引用的纯工具定义示例：

```ts
import { z } from "zod";
import { defineTool } from "@atelier/sdk/contracts";

export const Search = defineTool({
  name: "search",
  description: "Find entries containing the supplied text.",
  guidelines: [
    "Select the search scope using the resource's target schema.",
    "Match query as literal text, not as a regular expression.",
  ],
  argsSchema: z.strictObject({
    query: z.string().min(1).describe("Non-empty literal text to find."),
  }).describe("Parameters for literal text search."),
});
```

`defineImplementation` 将共享工具、资源契约与实现的 target/result 关联；SDK 的 `implementTool` 推导 handler 的 data、target、args 和返回值类型。完整实现见 [目录契约](filesystem/contract.ts) 与 [目录后端](filesystem/runtime.ts)。

`toModel` 可省略，默认使用 data；只在终结时生成并保存模型投影，自定义投影应保留结果契约的含义。非成功结局的模型投影还包含 kind、错误或说明。target 由 handler 直接解释：目录 list 使用 null 或 `{path}`，文件 read 使用 `{path, offset?, limit?}`，笔记 read 使用 null，其他模块可以使用 `{piece}` 等结构。内容范围属于定位，不强制所有资源采用行号；anchored 属于 read 自身的行为参数。无通用目标解析器，不在公共工具函数里维护资源类型分支。

SDK handler 的 context 提供 `signal / object / publish(data)`，object 是绑定对象的公开门面。publish 发布当前完整产出，使用与最终 data 相同的 schema；快照通过校验后替换最近的产出，经会话进度送到 UI，不写历史或交给模型。尚未确定的字段用 schema 中明确的 null 或阶段联合表达，不使用 `Partial<最终成功结果>` 绕过校验。工具完成时返回 CallResult；成功/部分完成必须提供 data，失败/拒绝/取消/未知结局可省略 data 以保留最近产出，显式 null 则清空。终结后 publish 失效。

工具应在结束前收束自己的事件监听与子进程；回调失效不等于停止底层操作。运行时在异常路径保留最后合法产出，只读中止记 cancelled，无法确认写入影响记 unknown；不因为收到了 abort 信号就宣称写入已撤销。连续产出、终结与取消的完整用例见 [工具执行契约测试](../execution/core.test.ts)。

args、target、result schema 必须有非空的整体 description，声明 helper 在定义时检查；各字段也应说明类型、定位基准、空值、限制与结果含义，描述随 JSON Schema 投影。target/result 的说明由资源实现提供，不重复共享工具用法。

注册边界负责校验资源状态、target、args 和返回数据。一个资源类型与工具名只能有一个当前实现；同名工具的 description、guidelines、args schema（含描述）及读写属性必须一致，target/result 可以不同。实现有独立 ID/版本；更改已保存结果的形状或含义时增加版本。读写副作用与并行/顺序策略属于执行信息，调度器据此执行和分类失败。

外部授权位于 `execution/`：请求开始时按已链接资源匹配工具，再应用 agent.tools/excludeTools。资源实例不持有工具白名单。宿主固定入口 resource_list/inspect/call 不注册到工具目录。

### 调用说明与错误自愈

新增或修改工具时，模型应能依据首次提供的说明构造合法调用，并依据失败结果决定如何修正或停止：

- 参数说明明确 JSON 类型、定位基准、空值含义与限制，并给出符合契约的调用示例。`target`、`args` 直接传 schema 规定的 JSON 值；对象与 null 保持原类型，不编码成 JSON 字符串。
- 参数校验返回具体字段路径与校验原因，union 保留各分支约束；同时报告 target 与 args 的问题。修复建议对应当前资源的实现契约，不只要求再次 inspect。
- 预期执行失败使用稳定错误码，说明失败环节、已知原因和下一步。路径不存在、绝对路径不受支持、越界、类型不符、权限不足与解析失败分别处理；资源根失效与内部目标失效分别指明。
- 建议必须在工具能力与授权内可执行。能修正参数时说明怎么改，需要用户处理权限或重新链接时明确告知；原因未知时保留不确定性，不诱导无依据地改参数或重复重试。写入结果不确定时先检查资源再决定后续操作。
- 错误通过工具结局交给模型并保存到历史，用户视图消费同一结局及保留的产出；错误说明由统一外壳显示。返回公开诊断信息，不透传异常堆栈、凭据或未经筛选的内部错误对象。

验证优先覆盖“失败信息足以区分原因，以及按提示修正后的调用能成功”的最小边界，复用现有测试设施。

## 资源后台

`implementResource` 注册状态投影 `project`、实时检查 `inspect` 和可选环境来源 `context`。project 返回卡片契约的数据；包装层生成 `{contract: {id, version}, data}`，经 IPC 发送给前端。SDK 的读取 handler 接收资源 data 与 ObjectReader，目录 inspect 从公开会话快照取得对象标题，不读取物理会话节点。

资源内联聚合一个可选创建实现和一组动作实现。纯契约声明稳定身份、版本、关联资源和输入 schema，前端持契约调用，宿主依据已注册声明校验和路由。创建先异步准备输入，再在宿主事务内同步返回 `{title, data}`；数据和事件通过执行门面的 `commit` 加入同一事务。动作经绑定具体契约的外部准备者和自身准备后按对象排队。输入 schema 只校验并保持 JSON 值，默认值、去空白和转换放在显式准备中，相邻适配层不重复解析。

投影、检查、环境读取、链接说明与准备只取得 `ObjectReader`；创建、动作和授权工具执行取得 `ObjectExecutor`。读取门面的 session 也是只读。任务、动作与模型调用共用宿主内部运行生命周期，分别保留去重、排队和请求授权规则。具体有效期及提交约束见 SDK 说明。

笔记的不可变资源数据为 `{}`，当前正文由 `NoteContent` v1 声明，以 `object.get(NoteContent)` 读取，以 `object.commit` 中的 `writer.set` 保存。状态提交由宿主通知视图刷新，不追加正文历史；卡片与历史查看都显示当前值。空正文是有效状态，缺失或损坏的正文回退为不可用，工具拒绝覆盖。正文限制为 100,000 UTF-16 code units，由契约与工具验证共用同一上限。

### 会话数据与 Agent

`session.get / commit` 与 `object.get / commit` 分别作用于当前会话数据与当前对象数据，数据按契约身份与版本保存到 `session_data`。当前值不随历史位置恢复；重建历史须消费不可变时间轴事件。插件目录的数据独立于会话生命周期。

Agent 的选择和提交去重保存于对象数据，用户输入与执行输出保存为 `UserMessage / Execution / Notice` 记录；每次请求由 `agent/projection.ts` 重建消息。`agent/configuration.ts` 声明只读配置目录，应用级配置与用户覆盖仍由宿主保存。运行以对象绑定任务承载，取消与关闭由托管设施收束；会话仅在全部对象收束后允许回溯，移除对象也要求该对象收束。命名使用首条 `UserMessage`，通过 `models.stream` 和标题比较更新完成。

## 资源视图

`RendererModule.resources` 按资源类型声明静态 `kind / label / icon`，label 在模块中使用应用本地化文案。`ViewRegistry.resource(kind)` 不解析正文、不构造 Body，向对象目录、历史、授权、添加入口和卡片外壳提供同一份识别信息；未知类型回退为通用资源。类型身份重复注册会被拒绝。描述不随实例存储，不包含动态能力与授权。

`cardRenderer(DirectoryView, …)` 使用卡片契约推导 data 类型。卡片提供默认 width/height、可选 minWidth/minHeight、Body 和可选 Actions；宽高使用画布单位，未声明下限时使用公共下限。工作台统一处理缩放、尺寸覆盖和保存，ObjectCard 处理框架、标题栏拖动、折叠与关闭，ObjectActions 提供尺寸预设、恢复默认与对象移除入口。模块不重建这套外壳。Body 使用可伸缩的内容区，溢出时在内部滚动；媒体视图可在内容区按比例适配，外框尺寸不强制锁定比例。

`RendererModule.tools` 注册 `toolRenderer(DirectoryList, { label, icon, headerRenderer?, bodyRenderer? })`。两个 renderer 是独立可选的 React 组件，接收同一份 `ToolRenderProps`：phase、name、target、args、invocation 与 result；实现契约推导并校验 target、args、data 类型。result 为 null 表示尚未执行；运行中为 `{kind: "running", data}`，终结后沿用 data 并携带具体结局。invocation 包含当次资源身份与可用的开始/结束时间。header 可只依据调用信息渲染，也可随 data 更新；只输出摘要内容，不嵌套按钮等交互控件。

缺少 headerRenderer 时显示工具名称与资源，缺少 bodyRenderer 时显示原始数据。两个入口互不影响。外壳控制状态图标、异常标识、展开与调用详情；过程数据更新和最终保存不重置展开。参数填充期间不调用专用 renderer，使用内置提示；执行中尚无产出时不能展开，终结后可查看空结果或失败原因。

header 按单行摘要设计，由 renderer 自行安排内容、排列和省略；这是设计规范，外壳不设置高度上限或强制裁切。工具 header 可复用 `renderer/shared/tool-header.tsx` 的 ToolHeader，组合操作名、可收缩的资源名称或路径及右侧摘要；长文本末尾省略，数量与类型不换行。header 不嵌套交互控件，正文渲染独立。

三个宿主固定入口在 `renderer/features/conversation/tool-views.tsx` 内置，不进入模块注册面。resource_call 的适配器将完整内层参数、选定实现身份和同一结果交给 ViewRegistry，直接采用二级工具的图标与两个视图入口；不新增外层折叠框。

前端目录在应用根通过 ModuleViewsProvider 注入。基础对象接口提供读取、具型创建／动作、对象流与通用运行状态；模型进度、配置目录、工具展示经具名接口按需取得，共享已有宿主状态源。`agent/conversation/` 组合时间轴、输出跟随、消息输入、配置选择与交互协调；草稿和重试身份按会话／对象保留，导航显式注入。公共控件与文案可从 `renderer/shared/` 复用；模块不导入宿主控制器、物理节点或模块总表。

## 历史

工具的所有终结结局保存实际实现的 ID/版本、请求边界内的资源身份/类型/名称、执行时间及当次 data/model。历史模型投影读取保存的 model；用户视图按实现 ID/版本读取组件并展示保存的 data，包括取消或失败前的有效产出。资源已删除或文件已变化，都不触发重新执行或重新读文件。中间快照只在内存中维护，不承诺进程崩溃后的产出恢复。

renderer 可同时注册同一 ID 的多个版本以展示历史；当前执行目录只注册一个适用实现。缺失精确版本或数据不合契约时，宿主显示原始数据。函数、React 组件和后端实例不会进入持久化或 IPC。

卡片视图按资源自身的历史能力投影；目录仍是路径引用，卡片不是文件系统快照。工具结果的当次数据与资源当前内容分别处理。
