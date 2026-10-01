# 验证 Electron 构建与打包组合

> 立案 2026-09-18。桌面框架实施已授权并完成工程接线；保留本计划跟踪 GUI、跨平台与尚未接入模块的兼容性验收。

## 范围与候选

- 包管理器 npm。代码构建 electron-vite，打包分发 Electron Forge；不叠加 Forge Vite 插件承担同一构建职责。
- SQLite 使用 `node:sqlite`；运行时未提供该模块或能力不足时改用 better-sqlite3。
- 校验使用 Zod。
- 锁定 shadcn/ui 的底层组件实现与初始化配置，保持整套控件一致。

## 验证项

- 主进程、preload、renderer 与独立任务运行时的入口和产物明确，打包后仍可启动任务进程。
- Electron 内置 Node.js 与 `node:sqlite`、模型 SDK、MCP SDK 的版本及 ESM 兼容。
- Tailwind 样式生成、React Flow 样式加载与 Monaco worker 资源定位。
- macOS、Windows、Linux 的打包路径，以及未来签名、更新与 release CI 的接入能力。
- Renderer 不因构建便利而获得通用 Node.js 或任意 IPC 访问能力。

## 完成条件

- 将锁定的依赖版本与进程入口写入 `docs/architecture.md` 和 `docs/decisions.md`，同步路线图。
- 实现期由 agent 执行静态检查及单元／契约测试；GUI 和打包产物的实际交互由用户确认，不做启动后等待并杀进程式冒烟。
- 发布自动化沿用 `todo-2026-09-17-release-ci.md`，本任务不授权 CI、签名凭据配置或远端操作。

## 当前验证

- 已锁定 Electron 44.5.1、electron-vite 5.0.0、Forge 8.0.1、Vite 7.3.6；shadcn/ui 采用 Radix，配置为 `components.json`。
- main/runtime 为 ESM 多入口，preload 为沙箱 CJS bundle；四个进程/页面入口已构建并进入 macOS arm64 ASAR。
- `npm run package`、`npm run make` 已成功生成本机未签名应用与 ZIP；未启动 GUI。
- 已完成类型检查、15 个历史/应用/请求生命周期测试。Tailwind 与 React Flow 样式已进入 renderer 产物。
- 待用户确认：开发启动与热更新、打包应用打开工作区、关闭/重启、真实 utilityProcess 中的 SQLite，以及 Windows/Linux 的构建与交互。
- Monaco、模型 SDK 与 MCP SDK 尚未接入，不宣称兼容验证完成；跟踪 `todo-2026-10-01-runtime-capabilities.md`。

## 参考

- [electron-vite 分发指南](https://electron-vite.org/guide/distribution)
- [Electron Forge](https://www.electronforge.io/)
- [Forge Vite 插件](https://www.electronforge.io/config/plugins/vite)
- [shadcn/ui 初始化与底层组件选择](https://ui.shadcn.com/docs/changelog/2025-12-shadcn-create)
