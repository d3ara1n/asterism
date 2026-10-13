# 品牌更名与仓库同步

> 立案 2026-10-10。产品英文名 Atelier、中文名 工坊，包与仓库目标名称 `atelier`。先完成本地源码更名与统一身份，再处理仓库改名和远端同步；最后由用户改本地文件夹名。开发前期旧应用数据直接清理，不做兼容、迁移或备份。

## 品牌事实与边界

- Atelier / 工坊由用户拍板。已知 [getatelier.app](https://getatelier.app) 是同名 AI 工作台，[atelier.dev](https://atelier.dev) 是代理开发工具，Microsoft Store 存在 Atelier Agent；不能将其概括为与本项目无关的同名产品。
- [Corsair Atelier](https://atelier.corsair.com/faq) 带 AI 设计助手；[第三方商标记录](https://markinton.com/trademark/atelier-99752639)列出 Corsair 的裸词 ATELIER 申请 99752639，2026-04-08 提交、live / pending。官方档案状态未核实，不断言软件类无活体商标或无在先权利。
- 软件以开源分发为主；将来的收费 gateway 使用另外的品牌。免费、开源或不同服务名称不自动免除商标风险，实际判断取决于目标地区、权利范围、来源识别与混淆可能性。公开资料核验不构成个案侵权结论。
- npm `atelier` 现存旧构建工具；本应用为私有包，不发布到该裸包名。GitHub 使用用户自己的仓库，不使用已有 `atelier` 组织。

## 统一身份

| 内容 | 真值与引用 |
| --- | --- |
| 对外名称 | `src/shared/application.ts` 的 `applicationBrand`，英文 Atelier、中文 工坊 |
| 包与仓库名称 | `applicationSlug` 为 `atelier`；JSON 清单按工程契约保持同步 |
| 应用与可执行文件名称 | `applicationBrand.en` 为 `Atelier`；打包器以可执行文件名生成 macOS 显示名，保持正式品牌大小写 |
| 固定系统身份 | `applicationId` 为 `dev.dearain.atelier`，Forge 与 Windows 共同引用；不随品牌显示名变化 |
| 开发 / 发布数据根 | `applicationDataDirectory` 在 Electron `appData` 下解析为 `dev.dearain.atelier-development` / `dev.dearain.atelier`，两者显式设置 `userData` |
| 数据布局 | `applicationStorage` 统一配置、凭据、外观、窗口状态、数据库、对象、日志与 Chromium 子目录；数据库为 `db/workspace.sqlite` |
| 内部命名空间 | `src/shared/core.ts` 生成固定 `core.*` 契约身份、`core:*` IPC 通道，桌面桥固定为 `window.host` |
| 模型固定入口 | `resource_list`、`resource_inspect`、`resource_call`，不随品牌变化 |
| 图形 | 保留现有界面线框，组件为中性 `BrandMark`；正式平台图标按独立图标计划设计 |

## 本地更名

- [x] npm 清单、锁文件、Forge 显示名与可执行文件名、bundle ID、Windows AppUserModelID、HTML 与窗口标题统一。
- [x] 首页、侧栏、设置与错误文案、任务进程名称、系统提示词均引用共享品牌；内部提示块来源固定为 core。
- [x] 固定入口文件、类型与函数采用 core 命名；内置展示契约和工具实现身份、IPC 与 preload 桥同步，前后端引用一致。
- [x] 开发与发布的数据根显式生成；先创建目录再设置 Electron 路径；electron-store 与任务进程使用同一数据根。文件名与无鉴权占位值不含品牌。
- [x] 工作数据只支持当前格式，不增加兼容读取、迁移或备份机制；已检查本机旧应用目录与仓库内旧数据目录，均不存在，旧 Weft 打包产物已删除。
- [x] README、产品定义、词汇表与应用“关于”围绕“与代理一起做事的个人工坊”重写；包与仓库简介同步。AGENTS、源码说明和未归档计划统一身份与术语，明确私有孵化阶段；`plans/archived/` 不修改。
- [x] typecheck、30 个文件共 234 项单元与契约测试通过；macOS arm64 构建与打包通过，包名称、显示名、可执行文件名、bundle ID、ASAR 入口和旧品牌残留检查通过。
- [x] 用户验收新名称、桌面桥功能、数据目录初始化、外观保存与重开（2026-10-13 确认）。

## 仓库与文件夹

- [x] 本地改动摘要已展示，用户明确授权提交与推送；提交及远端状态以 git 记录为准。
- [x] GitHub 仓库已改为 `d3ara1n/atelier`，原仓库身份与历史保留，仍为私有；简介与 `package.json` 同步。
- [x] 本地 origin 的 fetch / push 地址均为 `git@github.com:d3ara1n/atelier.git`，main 同步使用新地址。
- [x] 本地文件夹已为 `atelier`，当前路径 `/Users/chien/Projects/atelier`；源码、构建与数据位置不依赖绝对仓库路径。

全部完成后移入 `plans/archived/`，统一身份与数据布局的最终约定保留在 `docs/decisions.md` 和 `docs/architecture.md`。
