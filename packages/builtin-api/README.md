# 内置插件公共 API（`@atelier/builtin-api`）

内置实现与外部插件共同消费的领域契约、后台创建入口与前端扩展 API，当前版本 **0.14.0**。插件身份为 `atelier.builtin`；本包不注册第二个插件，也不依赖 `@atelier/builtin` 实现。公共加载与生命周期规则见 [插件 SDK](../../docs/plugin-sdk.md#公共模块与契约身份)。

## 入口与边界

`@atelier/builtin-api/contracts` 不依赖 Node 或 React，导出：

- `builtin` 命名空间、Agent 资源与创建／提交／继续／配置／取消动作。
- Agent 输入、配置、选择和历史记录契约，以及会话命名记录与 `NamingApi` 接口类型。
- `SubmitAgentInput` 的 `mode: "steer" | "follow"` 与 `AgentInputMessage.startsTurn` 的语义见 [输入调度与执行轮次](../../docs/runtime.md#输入调度与草稿箱)。草稿箱界面动作属于内置实现，不从公共包导出。
- `AgentInputMessage` 记录用户与代理输入，`AgentMessageSender / agentMessageSenderSchema` 表达发送者，`Send` 为通信资源共享的发送契约，各实现独立声明 target schema；语义见 [代理通信](../../docs/runtime.md#代理通信)。`SubmitAgentInput.sender` 省略时为用户，后台适配者显式提供发送者。
- 资源工具共享声明 `List / Read / Edit / Write / See / Wait`：只定义参数与语义，target 与结果由各资源实现声明；配套正文结果 `textReadSchema / textChangeSchema` 与编辑操作 `editOperationSchema`。第三方资源可实现同一声明。规则见 [资源工具共享声明](../../docs/runtime.md#资源工具共享声明)。
- `AgentRequestContext`：工作请求终态中的具型领域资料，生产与读取遵循 [请求诊断](../../docs/runtime.md#请求诊断)，不构成独立历史记录。
- `AgentConfigurations` 与 `ModelConfiguration` 目录契约；只包含内置领域需要的配置视图，不暴露配置文件、凭据、测试与覆盖编辑状态。
- `ReadAgentCreations`：通过 SDK 具型调用查询模型创建入口与资源类型的关联，供前后端公共消费者使用。
- `resolveAgentModelSelection`：按目录解析代理选择的模型引用、可用模型与思考等级，供摘要展示；`resolveAgentModel` 只取其中的模型。展示结果不改写原始选择，也不替代请求边界校验。

`@atelier/builtin-api/renderer` 依赖宿主共享的 React，提供 Agent 界面登记和呈现 API，只允许前端导入。执行循环、压缩策略、提交去重、卡片投影及实际布局属于实现包。取得契约不授予对象写权限；外部准备者仍只能读取宿主绑定的对象门面。顶层工具与插件调用接口属于 [SDK](../sdk/README.md)，内置 ask_user 通过这些公共接口消费 Agent UI。

`@atelier/builtin-api/runtime` 只允许后台导入，导出 `defineAgentCreation` 与 `agentCreations`，供插件声明 Agent 创建入口及内置工具消费目录。通用会话创建、链接和移除仍属于 SDK。

## 作者接入

消费者在 `package.json` 中声明公共包版本范围，并保留公共包导入：

```json
{
  "name": "@example/input-review",
  "version": "1.0.0",
  "type": "module",
  "peerDependencies": {
    "@atelier/sdk": "^0.39.0",
    "@atelier/builtin-api": "^0.14.0"
  },
  "atelier": {
    "id": "example.input-review",
    "api": { "major": 15, "minMinor": 0 },
    "runtime": "./src/runtime.ts"
  }
}
```

[可编译示例](examples/input-review.ts) 使用 `implementPreparer(SubmitAgentInput, ...)` 扩展现有 Agent 的输入准备，直接纳入项目类型检查。不需要重写 Agent 或导入应用内部目录。

后台插件通过 SDK API 11.1 的 `session.invoke(SubmitAgentInput, agentRef, input, options)` 提交输入，通过同一入口调用 `CancelAgent` 等资源动作。调用不取得 Agent 私有门面；提交受理与独立执行的边界见 [输入调度](../../docs/runtime.md#输入调度与草稿箱)，可编译示例见 [`examples/agent-input.ts`](examples/agent-input.ts)。

开发时可在本仓库使用 npm workspace；独立作者可用 `npm pack --workspace @atelier/sdk` 与 `npm pack --workspace @atelier/builtin-api` 生成本地包并安装。当前为孵化期私有包，不依赖 npm registry 发布。作者如预先打包插件，须将 `@atelier/sdk/*`、`@atelier/builtin-api/*` 保留为外部导入，不内联声明源码；包清单仍保留 peerDependencies。

宿主采用已登记公共包版本检查 npm semver 范围，依赖缺失、不兼容或未公开子入口明确失败。消费者自己的安装副本仅用于作者开发，执行时由宿主转接到本环境已经加载的同一份声明。后台、前端分别共享，不跨进程共享对象。公共包版本与 `atelier.api` 的宿主 SDK API 版本分别校验。

## Agent 创建入口

资源实现继续使用 SDK 的 `CreationContract`。需要向 Agent 提供创建方式时，在插件 `modules` 中加入 `defineAgentCreation(...)` 返回的模块：

```ts
import { defineAgentCreation } from "@atelier/builtin-api/runtime";

const agentCreation = defineAgentCreation({
  id: ns.name("document.create"),
  description: "Create a document with initial text.",
  creation: CreateDocument,
});
```

需要不同的模型参数时，同时提供 `inputSchema` 与同步 `toInput(input, { object })`；`object` 为调用绑定的只读执行者。模型输入按该 schema 解析后交给转换函数，转换结果再由原创建契约解析；直接复用时不重复执行创建 schema 的 transform。可选的同步 `toOptions(input, { object })` 接收同一份已解析输入，返回 `ToolSession.create` 的创建选项，沿用宿主授权与事务校验。完整可编译例子见 [`examples/resource-creation.ts`](examples/resource-creation.ts)。

入口 ID 属于声明插件；同宿主重复 ID 明确失败。目录按宿主实例隔离，并随插件装配失败或关闭撤销登记。`agentCreations.list(plugin)` 返回摘要，`inspect(plugin, id)` 返回输入 schema 与规则，`create(plugin, id, input, toolContext)` 消费本次工具的受约束会话能力。模型工具、各入口输入、初始链接与移除规则见 [Agent 创建与移除](../../docs/runtime.md#agent-创建与移除)。

这里的 Agent 创建入口指供 Agent 调用的资源创建通路，适用于笔记、Agent 及第三方资源。前端通过 `useRendererCalls().invoke(ReadAgentCreations, {}, { signal })` 读取 `{ id, resourceKind }[]`，再用 SDK 的 `useRendererResources()` 查询资源类型的本地化名称和图标；入口 ID、创建契约 ID 与资源类型分别寻址，无需同名。查询不创建资源，也不开放执行权限。

## Agent 界面扩展

在插件清单的 `atelier.renderer` 指定前端入口，并在 `prepare` 中登记组件：

```tsx
import { agentUI, AgentOverlay } from "@atelier/builtin-api/renderer";
import { defineRendererPlugin, useRendererObject } from "@atelier/sdk/renderer";

function Questions() {
  const agent = useRendererObject();
  // 在此按 agent.ref 读取／订阅插件自己的待回答状态。
  return <AgentOverlay position="bottom" hideComposer>
    <p>Question for {agent.ref.id}</p>
  </AgentOverlay>;
}

export default defineRendererPlugin({
  async prepare({ signal }) {
    agentUI.register({ id: "example.questions/panel", Component: Questions }, { signal });
  },
});
```

| 接口 | 用法 |
| --- | --- |
| `agentUI.register({ id, Component }, { signal })` | `id` 使用贡献插件的 `namespace.name(...)`；返回幂等的释放函数，也随 signal 释放。登记不应放在模块顶层副作用中 |
| `AgentToolbarItem` | 任意 `children` 呈现在输入工具栏；沿用相同登记入口，布局与显隐见 [Agent 扩展界面](../../docs/workbench.md#agent-扩展界面) |
| `useAgentModelSelection()` | 返回只读 `AgentModelSelection`：`selection / reference / model / thinking`；解析与失效语义见 [前端视图与扩展入口](../../docs/plugin-sdk.md#前端视图与扩展入口) |
| `AgentOverlay` | `position: "top" \| "center" \| "bottom"`、可选 `hideComposer`、任意 `children`；不显示时不挂载此组件 |
| `AgentModal` | 受控 `open`、`title: UiText`、可选 `description / onOpenChange / hideComposer`、`size: "default" \| "wide"`（默认 default）与任意 `children` |
| `AgentScrollArea` | overlay／modal 内的标准滚动区，`axis: "vertical" \| "horizontal" \| "both"`（默认 vertical）；支持 div 属性、`ref`、`className` 和 `style`，由内置实现统一处理焦点光圈留白与内容对齐 |
| `agentUI.subscribe / getSnapshot` | 内置实现订阅已登记贡献，保持同一公共服务实例 |
| `AgentUIRendererProvider / AgentModelSelectionProvider` | 内置实现注入三类呈现组件、标准滚动区及当前模型选择；第三方作者使用对应呈现组件与只读 hook |

每个贡献组件可同时呈现多个界面，通常用自己的 hooks 订阅业务状态。`useRendererObject()` 绑定当前 Agent；`useRendererPreferences()` 绑定贡献插件，其他 SDK hooks 沿用当前卡片的服务。UI 只改变呈现，不修改工具的取消、超时或结果协议。完整交互规则见 [Agent 扩展界面](../../docs/workbench.md#agent-扩展界面)。

内置配置选择器与上下文占用是实际使用的工具栏示例，见 [`Toolbar.tsx`](../builtin/src/agent/conversation/Toolbar.tsx)；两者在 Agent 的 renderer `prepare` 中独立登记，均通过 `AgentToolbarItem` 呈现，并消费 `useAgentModelSelection()`。配置提交使用内置交互协调器，读选择的公共 hook 不提供写权限。

需要局部滚动时，用 `<AgentScrollArea style={{ maxHeight: "16rem" }}>…</AgentScrollArea>` 包裹正文，固定标题和按钮放在外面；插件无需自行配置焦点光圈的 padding 或负边距。视觉规则见 [对象卡片尺寸](../../docs/design-system.md#对象卡片尺寸)。

[可编译的界面示例](examples/agent-ui.tsx) 接收插件提供的状态 hook，展示待办位置选择、`bottom + hideComposer` 提问和受控模态窗。示例不实现顶层工具或前后端通信；真实问答服务须在提交答案成功后清除待回答项，组件卸载不替代服务清理。恢复待回答状态、关联调用身份和工具取消由业务服务负责。
