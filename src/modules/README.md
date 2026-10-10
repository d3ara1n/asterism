# 功能模块

资源与工具在模型中平级；后端实现和对应 UI 在这里按功能共置。当前内置模块为 `notes/`、`filesystem/`、`agent/`。

## 三个入口

| 文件 | 职责 |
| --- | --- |
| `contract.ts` | 纯 Zod 契约：资源状态、卡片数据、工具实现的 target/result 和稳定 ID/版本；过程产出与终结 data 共用 result schema |
| `runtime.ts` | 默认导出 RuntimeModuleFactory，注册资源后端、资源控制器与工具实现；可使用 Node 和注入的存储、会话及配置服务 |
| `renderer.tsx` | 默认导出 RendererModule，声明静态资源展示描述，注册卡片内容、附加操作和工具 header/body，只依赖纯契约与前端代码 |

`modules/runtime.ts` 与 `modules/renderer.ts` 分别通过 Vite 静态 glob 收集对应入口。新增目录遵守入口约定即可进入构建；两个入口不要相互导入，也不要创建同时导出它们的 barrel。运行时不依赖 React，renderer 不导入 Node/数据库。当前只加载内置源码，不提供第三方安装、动态执行或沙箱。

资源创建与卡片行为通过 `resource.create` / `resource.command` 接入，由资源控制器校验输入并执行；没有对应控制器行为时拒绝命令。模型操作入口和资源授权独立于这些内部应用命令。

## 工具契约与实现

工具通过 `defineTool({ name, description, guidelines, argsSchema })` 定义。`description` 说明能力与适用场景，供模型挑选；`guidelines` 说明选定后的使用规则、示例和跨工具配合，允许为空数组；`argsSchema` 固定操作参数及其含义。不另设 snippet。

`tools/declarations.ts` 是内置共享定义的位置，目前只有 `List`。模块可在自己的纯契约文件声明独特工具，也可导出给其他模块引用；多个模块共用的契约可抽到共享库，不必修改 Weft 内置定义。相同工具复用同一份完整契约；用法或行为含义不同就定义另一工具，不在实现中覆写 description 或 guidelines。

一级 Weft 入口在 `tools/weft.ts` 声明，同样使用 ToolContract 和 defineTool；`execution/weft.ts` 固定装配执行器，不将入口注册到资源工具目录。`tools/definition.ts` 统一投影定义：一级入口将 guidelines 合入 provider 的 description，二级工具在链接说明与 inspect 中提供结构化 description、guidelines 和 args schema。注册与执行路径决定工具层级。

下面是一个可由多个模块引用的纯工具定义示例：

```ts
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

`defineImplementation` 将共享工具、资源契约与实现的 target/result 关联；`implement` 推导 handler 的 state、target、args 和返回值类型。完整实现见 [目录契约](filesystem/contract.ts) 与 [目录后端](filesystem/runtime.ts)。

`toModel` 可省略，默认使用 data；只在终结时生成并保存模型投影，自定义投影应保留结果契约的含义。非成功结局的模型投影还包含 kind、错误或说明。target 由 handler 直接解释：目录 list 使用 null 或 `{path}`，其他模块可以使用 `{piece}` 等结构。无通用目标解析器，不在公共工具函数里维护资源类型分支。

handler 的 context 提供 `signal / resource / publish(data)`。publish 发布当前完整产出，使用与最终 data 相同的 schema；快照通过校验后替换最近的产出，经会话进度送到 UI，不写历史或交给模型。尚未确定的字段用 schema 中明确的 null 或阶段联合表达，不使用 `Partial<最终成功结果>` 绕过校验。工具完成时返回 CallResult；成功/部分完成必须提供 data，失败/拒绝/取消/未知结局可省略 data 以保留最近产出，显式 null 则清空。终结后 publish 失效。

工具应在结束前收束自己的事件监听与子进程；回调失效不等于停止底层操作。运行时在异常路径保留最后合法产出，只读中止记 cancelled，无法确认写入影响记 unknown；不因为收到了 abort 信号就宣称写入已撤销。连续产出、终结与取消的完整用例见 [工具执行契约测试](../execution/weft.test.ts)。

args、target、result schema 必须有非空的整体 description，声明 helper 在定义时检查；各字段也应说明类型、定位基准、空值、限制与结果含义，描述随 JSON Schema 投影。target/result 的说明由资源实现提供，不重复共享工具用法。

注册边界负责校验资源状态、target、args 和返回数据。一个资源类型与工具名只能有一个当前实现；同名工具的 description、guidelines、args schema（含描述）及读写属性必须一致，target/result 可以不同。实现有独立 ID/版本；更改已保存结果的形状或含义时增加版本。读写副作用与并行/顺序策略属于执行信息，调度器据此执行和分类失败。

外部授权位于 `execution/`：请求开始时按已链接资源匹配工具，再应用 agent.tools/excludeTools。资源实例不持有工具白名单。Weft 固定入口 resource_list/inspect/call 不注册到工具目录。

### 调用说明与错误自愈

新增或修改工具时，模型应能依据首次提供的说明构造合法调用，并依据失败结果决定如何修正或停止：

- 参数说明明确 JSON 类型、定位基准、空值含义与限制，并给出符合契约的调用示例。`target`、`args` 直接传 schema 规定的 JSON 值；对象与 null 保持原类型，不编码成 JSON 字符串。
- 参数校验返回具体字段路径与校验原因，union 保留各分支约束；同时报告 target 与 args 的问题。修复建议对应当前资源的实现契约，不只要求再次 inspect。
- 预期执行失败使用稳定错误码，说明失败环节、已知原因和下一步。路径不存在、绝对路径不受支持、越界、类型不符、权限不足与解析失败分别处理；资源根失效与内部目标失效分别指明。
- 建议必须在工具能力与授权内可执行。能修正参数时说明怎么改，需要用户处理权限或重新链接时明确告知；原因未知时保留不确定性，不诱导无依据地改参数或重复重试。写入结果不确定时先检查资源再决定后续操作。
- 错误通过工具结局交给模型并保存到历史，用户视图消费同一结局及保留的产出；错误说明由统一外壳显示。返回公开诊断信息，不透传异常堆栈、凭据或未经筛选的内部错误对象。

验证优先覆盖“失败信息足以区分原因，以及按提示修正后的调用能成功”的最小边界，复用现有测试设施。

## 资源后端与视图

`implementResource` 注册状态投影 `project`、实时检查 `inspect` 和可选环境来源 `context`。project 返回卡片契约的数据；包装层生成 `{contract: {id, version}, data}`，经 IPC 发送给前端。

可选 `controller` 负责创建、命令与活动状态。命令经异步准备后须在写入事务中执行会话传入的 `before`，重新确认对象仍在当前路径上。`activity.running` 报告仍会向会话树追加事件的对象 ID，包括代理与其他被捕获的资源；只引用外部状态的持续运行不计入。活动开始、结束经 `SessionHost.progressChanged` 通知。会话仅在全部资源收束后允许回溯，移除对象也要求该对象收束。

`SessionHost.path` 读取当前路径；`SessionHost.commit` 在同步事务中接收成型记录与资源私有状态修改，提交后统一发布持久通知。回调内的 `SessionWriter` 只提供追加、终态与取得续接路径，节点身份、父指针、游标和自动吸附均由会话管理；不向资源控制器暴露可修改的 `SessionTree`。流增量保存在代理执行侧，不作为时间轴记录提交。

`RendererModule.resources` 按资源类型声明静态 `kind / label / icon`，label 在模块中使用应用本地化文案。`ViewRegistry.resource(kind)` 不解析正文、不构造 Body，向对象目录、历史、授权、添加入口和卡片外壳提供同一份识别信息；未知类型回退为通用资源。类型身份重复注册会被拒绝。描述不随实例存储，不包含动态能力与授权。

`cardRenderer(DirectoryView, …)` 使用卡片契约推导 data 类型。卡片提供尺寸、Body、可选 Actions；ObjectCard 统一处理框架、拖动、折叠与关闭，ObjectActions 提供对象移除入口。模块不重建这套外壳。

`RendererModule.tools` 注册 `toolRenderer(DirectoryList, { label, icon, headerRenderer?, bodyRenderer? })`。两个 renderer 是独立可选的 React 组件，接收同一份 `ToolRenderProps`：phase、name、target、args、invocation 与 result；实现契约推导并校验 target、args、data 类型。result 为 null 表示尚未执行；运行中为 `{kind: "running", data}`，终结后沿用 data 并携带具体结局。invocation 包含当次资源身份与可用的开始/结束时间。header 可只依据调用信息渲染，也可随 data 更新；只输出摘要内容，不嵌套按钮等交互控件。

缺少 headerRenderer 时显示工具名称与资源，缺少 bodyRenderer 时显示原始数据。两个入口互不影响。外壳控制状态图标、异常标识、展开与调用详情；过程数据更新和最终保存不重置展开。参数填充期间不调用专用 renderer，使用内置提示；执行中尚无产出时不能展开，终结后可查看空结果或失败原因。

三个 Weft 固定入口在 `renderer/features/conversation/tool-views.tsx` 内置，不进入模块注册面。resource_call 的适配器将完整内层参数、选定实现身份和同一结果交给 ViewRegistry，直接采用二级工具的图标与两个视图入口；不新增外层折叠框。

前端目录在应用根通过 ModuleViewsProvider 注入。卡片和对话只消费目录接口，不能导入模块总表，否则会形成“总表 → 代理卡片 → 对话 → 总表”的依赖环。

## 历史

工具的所有终结结局保存实际实现的 ID/版本、请求边界内的资源身份/类型/名称、执行时间及当次 data/model。历史模型投影读取保存的 model；用户视图按实现 ID/版本读取组件并展示保存的 data，包括取消或失败前的有效产出。资源已删除或文件已变化，都不触发重新执行或重新读文件。中间快照只在内存中维护，不承诺进程崩溃后的产出恢复。

renderer 可同时注册同一 ID 的多个版本以展示历史；当前执行目录只注册一个适用实现。缺失精确版本或数据不合契约时，宿主显示原始数据。函数、React 组件和后端实例不会进入持久化或 IPC。

卡片视图按资源自身的历史能力投影；目录仍是路径引用，卡片不是文件系统快照。工具结果的当次数据与资源当前内容分别处理。
