# libripgrep 跨平台接入

立案日期：2026-10-25

状态：等待 Windows 支持。

## 目标与前提

用户选定 libripgrep 为后续搜索引擎方向；Windows 支持就绪后，评估并替换目录搜索使用的 rg 子进程。当前实现与对外契约分别见 [技术架构](../docs/architecture.md#目录搜索进程与分发) 与 [目录搜索](../docs/runtime.md#目录搜索findgrep)。

跟踪对象为 npm [`libripgrep`](https://github.com/JoshuaWise/libripgrep) 的 Node N-API 绑定。立案时上游仅声明 GNU/Linux 与 macOS，预编译覆盖这两平台的 x64／arm64，要求 Node ≥ 24；此处不指 ripgrep 自身已跨平台的 Rust crate 集合。

## 后续工作

- 核验 libripgrep 已发布版本的 Windows 支持、目标架构、Node／Electron 接入方式与可分发产物。
- 核验取消、流式输出、ignore／glob、文本编码和搜索性能，确认三平台能力足以承接当前目录搜索契约。
- Windows 条件满足后接入库调用，同步删除 `@vscode/ripgrep` 依赖、专用子进程协议与对应打包配置；更新设计真值与决策归档。
- 跨平台验证完成后，将本计划移入 `plans/archived/`。

迁移前继续使用随应用分发的 rg；本计划不预设支持日期。
