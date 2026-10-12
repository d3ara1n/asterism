# 存储格式演进与启动恢复

首个正式版发布前沿用“格式不符即拒绝、开发数据删除重建”。本计划记录发布后的目标做法，有需求时再立项实施；涉及存储格式与对外行为，实施前须拍板。

## 目标

- 只向前迁移：以 SQLite `user_version` 为格式号，每次结构变更提供一个迁移步骤，启动时逐步升级到当前版本；每步在事务内执行，失败整体回滚。
- 迁移前备份：用 `VACUUM INTO` 或 SQLite backup API 生成带版本号的副本，保留有限份数；迁移失败可恢复原库。不以“备份后全新启动”代替迁移。
- 库比程序新（降级）：拒绝写入，提示升级应用，提供退出与打开数据目录；不自动迁移或覆盖。可选区分读兼容与写兼容版本，仅新增表／列时允许旧版只读打开。
- 启动失败分类可诊断：格式过新、迁移失败（附备份位置）、文件损坏、其他错误各有用户可理解的提示与恢复操作，不只写日志。
- 不可变内容按 ID 存放，迁移通常只改表结构，不改写已封存字节。
- 应用配置、插件配置等独立文件格式遵循同一原则。

## 当前状态

- `src/runtime/storage.ts`：`openDatabase` 只认 `workspaceDatabaseVersion`；版本为 0 时建当前结构，其他不符抛 `DatabaseVersionError`（附 `db/` 目录与双方版本）。
- `src/runtime/index.ts`：初始化失败发送 `{ kind: "fatal", reason, message, directory? }`；`reason` 当前为 `database_version | unknown`，消息形状定义在 `src/shared/contracts.ts` 的 `runtimeMessageSchema`。
- `src/main/runtime-host.ts`：把 `reason`、`directory` 附在 reject 的错误上。
- `src/main/index.ts`：`database_version` 弹开发者对话框（英文、不本地化，提示删除 `db/`，可打开目录）；其他走本地化的 `startupMessages.workspaceOpenFailed`。

## 接入指南

1. 在 `storage.ts` 以 `migrations: Record<number, (db) => void>` 替换“格式不符即抛错”：库版本低于当前时，先备份，再逐步执行并更新 `user_version`。首个正式版的格式号作为迁移基线，此前的开发格式不提供迁移。
2. 移除 `DatabaseVersionError`、开发者对话框与“删除 db/”文案。
3. 扩展 `reason`：`database_newer`（降级）、`migration_failed`（附备份路径字段）、`database_corrupt`，保留 `unknown`。新增字段按需加入 fatal 消息，`reason` 与消息形状沿用。
4. main 按 `reason` 显示面向用户的对话框，文案进入 `startupMessages` 本地化；按钮按类别提供退出、打开数据目录、打开日志或恢复备份。
5. 测试：以各历史格式的结构夹具验证升级结果、失败回滚与备份生成；降级场景验证拒绝写入。

## 待定

- 备份保留份数与位置；是否提供用户可见的恢复入口。
- 读／写兼容版本是否值得引入。
- 迁移步骤的测试方式：以各历史版本的结构夹具验证升级结果。
