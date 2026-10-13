# 记录来源字段

会话节点以统一的 `source` 表达“谁写入了这条记录”，取代兼作发出者与关联对象的 `agentId`。设计已确认，约定见 `docs/timeline.md#记录来源`、`docs/plugin-sdk.md#记录来源`。实施期间不要求中途可编译或可测试，全部完成后统一验收。开发数据不迁移，由用户删除。

## 最终约定

- `source: { plugin: string; resource: { id: string; kind: string } | null }`。
- `plugin` 由宿主按写入通道的插件身份打戳，插件不可填写；宿主工作台为 `atelier.host`。仅用于诊断，界面不显示。
- `resource` 由对象操作柄带入：`plugin.object(ResourceContract, id)` 以具名契约取得 kind；写入时校验契约属于调用插件、对象存在于会话且类型一致。`session.commit` 写入的记录为 null，即会话级。
- 关联语义（链接的代理、模型投影的接收代理等）放入各自载荷或专门字段，不借用来源。
- 历史面板只读 `source.resource`：来源行为「类型名 · 标题」或「会话」；筛选为全部、会话事件、全部资源事件、某个资源。
- `NamingAttempt` 删除，`SessionNamed` 为 `{ title, source: "user" | "auto", auto?: { level, messageId, model } }`。

## 步骤

- [x] 存储：`sessionNodeSchema` 以 `source` 取代 `agentId`；事件的模型接收方改为 `recipient`；链接事件载荷 `{ id, agentId }`；`session/schema.ts` 视图读 `$.source.resource.id`；`session/tree.ts` 同响应校验改读来源。
- [x] SDK：`SessionRecord.source` 取代 `resource`；`RecordSource` 类型；`plugin.object(contract, id)`；`appendRecord` 去掉 resource 参数。
- [x] 写入通道：`sdk-context.ts` 打戳与校验；`runtime/workbench.ts` 以 `atelier.host` 写入并把代理 id 移入载荷；`record-writer.ts`、`core-record-writer.ts`、`core-records.ts`、`plugins/records.ts` 映射来源。
- [x] 消费方：`session/fold.ts` 从载荷重建链接；`execution/request.ts`、`execution/response.ts`、agent 投影、时间轴、交互与命名策略改读 `source.resource`。
- [x] 命名：合并 `NamingAttempt` 到 `SessionNamed`，用命名事件判断去重与过时，记录生成模型。
- [x] 历史面板：`history-navigation.ts`、`History.tsx` 只读来源；删除 `workbenchEvents`、载荷猜测与类型反查；筛选文案改为会话事件；工作台记录视图从载荷读取代理。
- [x] 测试改写并全部通过；typecheck、i18n 检查通过。
- [x] 完成后本计划移入 `plans/archived/`。
