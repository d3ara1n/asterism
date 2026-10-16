# 内置插件公共 API（`@atelier/builtin-api`）

内置实现与外部插件共同消费的纯领域契约。插件身份为 `atelier.builtin`；本包不注册第二个插件，也不依赖 `@atelier/builtin` 实现。公共加载与生命周期规则见 [插件 SDK](../../docs/plugin-sdk.md#公共模块与契约身份)。

## 入口与边界

`@atelier/builtin-api/contracts` 不依赖 Node 或 React，导出：

- `builtin` 命名空间、Agent 资源与创建／提交／继续／配置／取消动作。
- Agent 输入、配置、选择和历史记录契约，以及会话命名记录与 `NamingApi` 接口类型。
- `AgentConfigurations` 与 `ModelConfiguration` 目录契约；只包含内置领域需要的配置视图，不暴露配置文件、凭据、测试与覆盖编辑状态。

执行循环、压缩策略、提交去重、卡片投影及 UI 组件属于实现包。取得契约不授予对象写权限；外部准备者仍只能读取宿主绑定的对象门面。Agent 槽位、顶层工具与插件调用接口尚待 [专项计划](../../plans/todo-2026-10-15-plugin-tools-ui.md) 实现。

## 作者接入

消费者在 `package.json` 中声明公共包版本范围，并保留公共包导入：

```json
{
  "name": "@example/input-review",
  "version": "1.0.0",
  "type": "module",
  "peerDependencies": {
    "@atelier/sdk": "^0.18.0",
    "@atelier/builtin-api": "^0.1.0"
  },
  "atelier": {
    "id": "example.input-review",
    "api": { "major": 8, "minMinor": 4 },
    "runtime": "./src/runtime.ts"
  }
}
```

[可编译示例](examples/input-review.ts) 使用 `implementPreparer(SubmitAgentInput, ...)` 扩展现有 Agent 的输入准备，直接纳入项目类型检查。不需要重写 Agent 或导入应用内部目录。

开发时可在本仓库使用 npm workspace；独立作者可用 `npm pack --workspace @atelier/sdk` 与 `npm pack --workspace @atelier/builtin-api` 生成本地包并安装。当前为孵化期私有包，不依赖 npm registry 发布。作者如预先打包插件，须将 `@atelier/sdk/*`、`@atelier/builtin-api/*` 保留为外部导入，不内联声明源码；包清单仍保留 peerDependencies。

宿主采用已登记公共包版本检查 npm semver 范围，依赖缺失、不兼容或未公开子入口明确失败。消费者自己的安装副本仅用于作者开发，执行时由宿主转接到本环境已经加载的同一份声明。后台、前端分别共享，不跨进程共享对象。公共包版本与 `atelier.api` 的宿主 SDK API 版本分别校验。
