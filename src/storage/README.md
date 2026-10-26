# 数据准备实现

生命周期与规则以[数据准备与迁移](../../docs/architecture.md#数据准备与迁移)为准，恢复交互见[启动屏](../../docs/workbench.md#启动屏)。

| 文件 | 职责 |
| --- | --- |
| `migrations.ts` | 只读版本号的检查、连续迁移路径、JSON 原子替换、SQLite 事务转换 |
| `files.ts` | 区分缺失与损坏的 JSON 读取、临时文件替换 |
| `application.ts` | 恢复点数据范围、宿主存储声明、只导入插件存储入口的发现 |
| `preparation.ts` | 恢复点创建与保留、还原与重新开始的可续接操作、还原后暂停、宿主与插件分级失败 |
| `../runtime/prepare-data.ts` | 独立准备进程入口 |
| `../main/data-preparation.ts` | 启动准备进程、转发设置可用性与实际进度；收到最终结果后结束进程并确认退出 |

各存储的当前版本常量由所属模块维护：工作库在 `runtime/storage.ts`，全局配置在 `configuration/store.ts`，插件列表在 `plugins/packages.ts`，外观、语言与更新设置共用 `shared/application.ts` 的 `preferenceVersion`，内置插件在 `packages/builtin/src/storage.ts`。写入方负责盖章；准备阶段不创建文件、不检查数据形状。

格式变化时递增对应常量。首个版本发布后同时追加迁移步骤：键 n 表示 n → n+1，JSON 平铺文档步骤返回下一版正文（版本号由适配器写入），信封文档步骤只处理 `data`，SQL 步骤使用传入连接。已发布步骤保持固定，不调用随业务规则变化的 helper，并以独立旧数据夹具验证。

新增宿主持久文件时加入 `application.ts` 的 `applicationDataPaths` 与 `hostStorages`；缓存不登记。
