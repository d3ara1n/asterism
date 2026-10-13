# 领域边界收回

平台提供模型能力、工具、链接授权与通用记录；执行体是插件定义的资源，其记录、投影与上下文截取归插件。目标：第三方 agent 插件提供自己的资源与记录，不改代码即可接入平台模型能力与工具。约定见 `docs/decisions.md#平台与执行体边界`。实施期间不要求中途可编译，全部完成后统一验收。开发数据不迁移，由用户删除。

## 最终约定

- 平台：`models.run / stream / validate`、工具目录与 `resource_*` 入口、工具批次、链接与授权、provider 适配与适配器续接资料、记录来源、会话活动状态。
- 宿主可选中任何完整节点并从那里继续，不吸附、不判断续接点；会话收束（无运行中的活动）仍是继续的前提。
- 执行体投影负责上下文截取：末尾思考等不能作为上下文结尾的内容由 agent 投影在唯一一处处理。
- agent 的执行块、用户消息、通知、上下文通知是普通插件记录；分组、序号、终态与用量在其契约 `data` 内，由 agent 投影与校验。
- 宿主节点只剩通用记录（契约、来源、载荷、模型可见文本、接收者）；不再有 message/thinking/text/toolcall/notice 物理类型。
- 配置是用户与插件协商的设置，经统一配置层声明、编辑、读取与通知；偏好只记录上次选择等无需统一入口的状态。思考与工具展开开关属于 core 配置。
- 首页发起是唯一指名内置 agent 的例外，经正规创建与动作接口完成，集中在一处并注明。

## 步骤

- [x] 文档：decisions、runtime、timeline、plugin-sdk、architecture、object-model、workbench、conversation-core、glossary。
- [x] 删除宿主续接：`continuable / snap`、`tree.select` 吸附、`continuationId`、`canResume` 中的吸附、历史面板 `continueAdjusted`。
- [x] agent 投影截取上下文末尾的思考，作为唯一续接规则。
- [x] 存储：会话节点统一为记录节点；删除块生成列、`block_completions`、`session_blocks / session_usage` 视图与同响应校验。
- [x] 删除 `core-records.ts`、`core-record-writer.ts`；`Execution` 终态以普通记录追加，agent 投影合并。
- [x] 执行层不写块，只向 observer 推事件；`LiveBlock` 不带 `agentId`，按运行对象归属。
- [x] 渲染层按记录契约与来源读取，删除节点类型分支；搜索使用记录视图摘要。
- [x] 插件配置层：`ns.config(schema, { defaults, presentation })` 纯契约前后台共享；后台 `plugin.config(contract)` 返回 `get / update / subscribe`；渲染层 `useRendererConfig(contract)`；宿主启动读取全部配置，保存后经配置通道广播前后台；插件只能读自己的配置。偏好（`useRendererPreferences`）仅记录上次选择，不进入配置层。
- [x] 思考与工具展开开关迁入 `atelier.core` 配置；删除外观设置四项、`theme.ts` 字段与 `object-context` 映射。
- [x] 首页发起集中为单一例外。
- [x] 测试改写，typecheck、测试与 i18n 检查通过；本计划归档。
