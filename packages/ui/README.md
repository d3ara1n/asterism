# 内部共享 UI（`@asterism/ui`）

应用与内置插件共用的基础控件、布局 helper、JSON／工具展示与界面消息。沿用 [设计系统](../../docs/design-system.md) 的 token 和样式，不持有应用状态、不访问 `window.host`，不导入宿主实现或内置 Agent。

通过 package.json 中的显式子入口消费，例如 `@asterism/ui/ui/button`、`@asterism/ui/ConfigurationChoice`。依赖 React、通用 SDK 的展示／本地化接口与既有 UI 库。本包不是插件，也不是对外插件作者的稳定 UI SDK。

应用负责加载主题样式与 `asterism.host` 翻译目录；Tailwind 源扫描包含本包与内置实现。需要访问应用状态的组合（如主题绑定的 toast）留在应用侧。

流式尾部预览使用 `@asterism/ui/streaming-preview` 的 `StreamingPreview`，传入 Markdown、代码或纯文本正文。组件统一维护窗口布局与预览可访问性，开合状态和终结正文由调用方管理；视觉契约见 [对话过程视图](../../docs/design-system.md#对话过程视图)。
