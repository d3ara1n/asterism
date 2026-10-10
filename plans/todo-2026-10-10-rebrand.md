# 品牌审查与全仓库改名

> 立案 2026-10-10。Weft 对大众陌生，织机隐喻只覆盖「连线」一层；软件本体是对象工作台：卡片、连线、可查看与分叉的历史。趁发布前改名窗口期（README、docs、`dev.dearain.weft`、glossary 均未对外）完成换名，发布后成本陡增。

## 候选与首选

- **Braid**：编结（线与线的关系）+ 时间操控双关，正对「历史可回放、可分叉」。风险：同名游戏搜索占位。
- **Atelier**：艺术家工坊，workbench 的陌生化，个人手作气质。风险：法语词，中文用户发音门槛。
- 备选：Bench、Weave、Warp、Trellis。中文候选：保留「织台」，或随英文概念换「织坊」/「案头」。

## 品牌审查（逐候选过一遍）

- [ ] 撞名与可发现性：搜索结果占位（Braid×游戏、Atelier×游戏系列等）、GitHub org/repo、npm 包名。
- [ ] `dev.dearain.<name>` 应用标识与未来域名可行性。
- [ ] 商标风险粗查；中文用户发音、输入与记忆门槛。
- [ ] 审查结论汇总后由用户拍板最终英文名与中文名（产品命名属必须拍板项）。

## 全仓库改名

- [ ] 品牌层：`package.json` name、`forge.config.ts` executableName、`src/shared/desktop.ts` applicationId、窗口标题与 `weft-mark.tsx` 图标、`i18n.ts` 对外文案、`electron.vite.config.ts` CSP 名。
- [ ] 文档层：README、docs/ 全部引用、`AGENTS.md`；`docs/glossary.md` 增补新名词条并移除 Weft 词条；`docs/decisions.md` 记录定名结论。
- [ ] 代码内部 `weft` 命名空间：`weft.resource-list` 等 presentation data key、`WeftAction`、`src/tools/weft.ts`、`src/execution/weft.ts`、`weft.test.ts`。语义是「本应用固定入口」，随品牌改或改中性命名空间，随拍板一起定。
- [ ] 数据边界：applicationId 变更切换 Electron userData 目录，开发数据不迁移、由用户重建；已写入开发数据的 `weft.*` data key 一并作废。
- [ ] 历史记录不改写：`plans/archived/` 与已结计划中的 Weft/织台引用保留。

## 验证

- [ ] typecheck、单元与契约测试；应用标识与数据目录切换后由用户启动验收；名称显示属视觉验收，不写测试。
