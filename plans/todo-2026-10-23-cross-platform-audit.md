# 跨平台行为统一审视

立案日期：2026-10-23

## 目标与范围

发布目标覆盖 macOS、Windows 与 Linux，但现有实现以 macOS 为主测平台，进程、路径、shell、窗口与凭据相关代码未经系统的跨平台审视。本计划统一检查并修正平台差异，不逐模块零散补丁。孵化期不保留旧写法或旧数据的兼容分支，发现不合理的平台抽象直接按当前契约重写。

## 已知问题

- MCP stdio 不经 shell spawn：Windows 上 `npx`、`uvx` 等 `.cmd`／`.bat` 包装命令无法直接启动，需要确定可执行文件解析或包装命令的启动方式。
- 登录 shell 环境只在 macOS／Linux 解析；Windows 沿用原环境，需确认 PATH 等变量在 Windows 下是否已完整。
- 进程树清理在 Windows 经 CIM 查询后代、`process.kill` 结束；终端仍用 `taskkill /T /F`，两处策略需统一并实测优雅退出。

## 待审视与实施

- [ ] 进程：`shell/process.ts` 进程组与 `taskkill`、`terminal/service.ts` 终止流程、`shared/process-tree.ts` 后代快照、MCP stdio 启动与回收。
- [ ] Shell：`shell/profiles.ts` 可执行文件查找（PATHEXT、大小写不敏感环境变量）、预设 profile 与平台偏好顺序、`terminal/integration.ts` 各 shell 注入脚本。
- [ ] 路径：目录资源真实路径校验、`~` 展开、分隔符与盘符、大小写不敏感文件系统、插件产物协议路径校验。
- [ ] 窗口：`window-appearance.ts`、`window-titlebar.ts` 材质与标题栏在 Windows／Linux 的回退，`desktop.ts` 平台判定。
- [ ] 凭据：`main/secrets.ts` 在 Windows DPAPI 与 Linux 各 keyring 后端下的可用性判定。
- [ ] 打包：原生模块（node-pty）与辅助程序在三平台的 asar 解包与执行权限。
- [ ] 将确认的平台规则写入对应真值文档，测试覆盖可确定的纯解析逻辑。

## 参考入口

- [进程职责与安全边界](../docs/architecture.md)
- [终端资源与目录 exec](../docs/runtime.md)
- [MCP 模块](../docs/mcp.md)
