# 品牌定名与全仓库改名

> 立案 2026-10-10。Weft 对大众陌生，织机隐喻只覆盖「连线」一层；软件本体是对象工作台：卡片、连线、可查看与分叉的历史。趁发布前改名窗口期（README、docs、`dev.dearain.weft`、glossary 均未对外）完成换名，发布后成本陡增。

## 定名结论（2026-10-10 拍板）

- 英文名 **Atelier**：裸词在软件类无活体商标（USPTO 公开粗查）、词义单一、A 开头排序占优。接受现存小产品同名（getatelier.app、MS Store Atelier Agent、atelier.dev VS Code 扩展等）；npm `atelier` 为 2016 年弃置构建工具，私有应用不发布无影响；github.com/atelier 被无关组织占用，不使用该 org。中文用户发音拼写门槛已知悉并接受（个人工具，中文界面为主）。
- 中文名 **工坊**：Atelier 直译，直指对象 + 操作的台面，不沾 KOEI「炼金工房」系列联想。
- 内部命名空间 **core.***：presentation data key 与固定入口实现改中性命名，持久层标识与品牌解耦，品牌再变更零迁移；未来插件系统以 `core.*`（宿主固定入口）与插件自身命名空间区分。`src` 下无撞名。
- 出局记录：Braid 一词多义出局（braid.software 经查为疑似无维护生成品，不构成威胁）；Weave / Warp / Bench / Trellis 均有活跃 AI 工具撞名，全灭。

## 品牌审查（已完成）

- [x] 撞名与可发现性：六候选核查完毕，Braid / Atelier 深查、其余四名快查，撞名事实已汇入定名结论。
- [x] `dev.dearain.atelier` 应用标识可行；域名暂不需要。
- [x] 商标粗查：ATELIER 裸词软件类无活体注册，KOEI 仅注册 ATELIER× 系列子名；非全库检索，不构成法律意见。
- [x] 用户拍板：英文 Atelier、中文 工坊、内部 core.*。

## 全仓库改名（待工作区其他改动落地后执行）

- [ ] 品牌层：`package.json` name、`forge.config.ts` executableName → `atelier`；`src/shared/desktop.ts` applicationId → `dev.dearain.atelier`；窗口标题与 `weft-mark.tsx` 图标；`i18n.ts` 对外文案（织台 → 工坊、Weft → Atelier）；`electron.vite.config.ts` CSP 名。
- [ ] 文档层：README、docs/ 全部引用、`AGENTS.md`；`docs/glossary.md` 增补 Atelier / 工坊词条并移除 Weft / 织台；`docs/decisions.md` 记录定名。
- [ ] 代码内部：`weft.*` data key → `core.*`；`WeftAction` → `CoreAction`；`src/tools/weft.ts` → `tools/core.ts`；`src/execution/weft.ts` → `execution/core.ts`；`weft.test.ts` → `core.test.ts`；全量引用同步。
- [ ] 数据边界：applicationId 变更换 Electron userData 目录，开发数据不迁移、由用户重建；旧 `weft.*` data key 作废。
- [ ] 历史记录不改写：`plans/archived/` 与已结计划中的 Weft / 织台引用保留。

## 验证

- [ ] typecheck、单元与契约测试；应用标识与数据目录切换后由用户启动验收；名称显示属视觉验收，不写测试。
