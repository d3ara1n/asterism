# 验证 Electron 构建与打包组合

> 立案 2026-09-18。进入桌面工程实现时执行；组合已定，版本与产物验证在实现中完成。脚手架、依赖安装与实现需另行授权。

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

## 参考

- [electron-vite 分发指南](https://electron-vite.org/guide/distribution)
- [Electron Forge](https://www.electronforge.io/)
- [Forge Vite 插件](https://www.electronforge.io/config/plugins/vite)
- [shadcn/ui 初始化与底层组件选择](https://ui.shadcn.com/docs/changelog/2025-12-shadcn-create)
