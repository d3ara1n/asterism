# 本地状态机制简化：运行时失效防御清理

立案日期：2026-10-21。

## 原则

以 `AGENTS.md`「本地操作按处理顺序生效」与「环境在请求边界取用」为准，文档契约已按最终形态更新（`docs/plugin-sdk.md`、`model-configuration.md`、`runtime.md`、`session-naming.md`、`design-system.md`、`architecture.md`、`glossary.md`，取舍见 `docs/decisions.md`「本地写入后写为准，移除运行时失效防御」）。本计划只做代码对齐。

- 写入按后台处理顺序生效，后写为准；读取直接采用每次返回的当前值。
- 删除：运行时递增的实体修订、读取代次（generation）、修订比较、`conflict` 报错替代按钮禁用、使用前复核捕获值是否仍为当前值。
- 保留：存储／IPC／API 的固定格式版本（如配置文件 `version: 7`、协议版本），它们表示软件代际；i18n 目录 `revision` 是内容哈希缓存键，同样保留。
- 同一入口重入用 pending 禁用；异步工作随所属取消作用域结束。不以新机制替代被删除的机制。
- 审查意见只作线索；不因假设性并发或巧合时序新增防御。

## 待完成

- [ ] **配置实体修订（存储与类型）**：删除 provider／model／role／agent 的 `revision` 字段及其递增逻辑：`src/configuration/store.ts`、`layers.ts`、`defaults.ts`、`model-catalog.ts`，`src/shared/configuration.ts`、`src/shared/model.ts`，`packages/builtin-api/src/configuration.ts`，以及设置页中的 `Omit<..., "revision">`。配置文件格式版本不变，旧文件中的多余字段由 schema 剥离，不写迁移。
- [ ] **连接测试**：`ConnectionTest` 删除 `providerRevision / modelRevision`；保存某模型或其连接时清除对应已结束的测试结果，运行中的测试照常结束。`ProvidersSettings.tsx` 删除 `stale` 计算与“过期”展示。删除并发测试数量上限（第 8 个返回 `conflict` 的分支）。
- [ ] **参数获取**：`service.ts` 的 `fetchParameters` 删除 `parameterRequests`、`invalidateParameterRequests` 与修订比较；目录返回后在队列中按当前模型合并参数并保存，模型已删除时返回 `not_found`。删除 `modelCatalogMessages.changed` 及其文案。
- [ ] **模型发现**：`ModelDiscovery` 删除 `providerRevision`；`discovery.add` 删除修订比较，加入当前连接。保存连接不再清除发现列表，重新获取时替换，删除连接时移除。
- [ ] **连接凭据**：`executionCredential(providerId)` 读取当前凭据，不比较修订。模型请求在开始时同时取用连接配置与凭据（`src/plugins/models.ts` 当前为懒加载 `credential ??=`，改为请求开始时取用），`src/runtime/sessions.ts:135` 同步。SDK `ProviderServices.credential(id, { signal? })`、`ProviderInfo` 删除 `revision`；`src/plugins/sdk-context.ts` 删除 `captured` 修订；`ModelResponse.connection` 改为只含 `id`（`packages/sdk/src/models.ts`、`src/model/ai-sdk.ts`）；更新 `packages/sdk/examples/consume-usage.ts` 与 `packages/sdk/README.md`。按 SDK 版本规则提升 API 版本号。
- [ ] **前端配置读取**：`src/renderer/features/configuration/state.ts` 删除 `generation`，每次读取或命令返回直接 `setSnapshot`；`run` 期间的 `busy` 已负责禁用入口。
- [ ] **账户用量**：`packages/builtin/src/usage/client.ts` 删除 `generation`；每个连接最多一个在途请求，变化通知到达时若有在途请求则在其完成后再查询一次，否则立即查询；`unavailable()` 只设置错误状态。`service.ts` 删除 `revision` 字段、三处修订比较、完成后的“当前项仍是自己”判断，以及 `consume` 的修订／端点校验；变化订阅仍清空缓存并中止在途查询，迟到结果按完成顺序写入。`contract.ts` 删除 `revision`。
- [ ] **创建输入准备**：`src/renderer/features/creation/coordinator.tsx` 删除 `inputGeneration`；取消时关闭该次 `content`，转换因内容关闭而拒绝即结束；准备期间 `busy` 禁用新的创建入口。删除“会话命令队列”旧注释。
- [ ] **窗口状态**：`src/renderer/app/window-state.ts` 删除 `changed` 标志，初始读取与后续事件都直接 `publish`。
- [ ] **文件写入**：`packages/builtin/src/filesystem/text-io.ts` 只保留操作开始时一次真实路径解析与根内校验、大小与 UTF-8 校验、同目录暂存加 `rename` 原子替换（新建同样暂存后 `rename`）。删除 `FileStamp` 比对、读取前后路径复核、父目录 inode 复核、提交前重读正文比对、`O_EXCL` + `link` 的排他新建、`withFileMutation` 按路径串行与 `file_changed` 错误。`rename` 阶段抛错仍返回 `unknown`。同步调整 `filesystem/runtime.ts` 调用方。
- [ ] **会话命名**：`packages/builtin/src/naming/runtime.ts` 删除请求开始前的 `isCurrent` 预检查与“最新命名事件身份”比较；追加时只检查当前路径仍包含触发输入、路径最新命名来源不是 `user`。
- [ ] **会话命令**：`src/runtime/sessions.ts` 删除 `submissionId` 的输入签名比对与并发 `start` 的二次查询（同 ID 直接返回已有结果），`packages/builtin/src/agent/submissions.ts` 同步；`src/renderer/features/session/controller.ts` 定位期间由入口禁用，删除返回 `conflict` 的分支。
- [ ] **跨进程重复校验**：动作与数据在 runtime、main、preload 多层解析／复制的路径逐项确认真实边界，删除重复工作；不建立新的通用验证框架。

## 不在范围

资源 busy 时禁止移除与回溯、同对象动作重入返回 `conflict`、问题已不在等待返回错误、ID 重复声明冲突：它们是产品规则或调用约束，不是运行时失效防御。

## 完成标准

- 代码中不再出现配置实体运行时 `revision`、读取 `generation` 与修订比较；固定格式版本保持不变。
- 同一入口异步期间由 pending 禁用，不用 `conflict` 报错代替。
- 只为旧机制存在的测试、文案、错误码分支一并删除；验证限于 typecheck 与受影响行为的现有测试。

完成后移入 `plans/archived/`。
