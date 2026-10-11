# 插件系统

原则见 `docs/decisions.md` 插件相关条目与 `docs/architecture.md#插件`。设计草案与类型原型已归档于 `plans/archived/draft-2026-10-12-*`，实施以代码与 docs 为准。

## 已完成

- [x] `@atelier/sdk` workspace 包：`contracts` / `runtime` / `renderer` 三入口；记录契约带版本升级与三态解码。
- [x] 现有存储格式到公开记录信封的 adapter（`src/plugins/records.ts`），不改存储。
- [x] 提交后观察、托管任务（进程内，关闭取消）、标题比较更新、core `naming` 模块。
- [x] 命令级 prepare（接受／替换／拒绝）与 `commands.invoke`。
- [x] 插件包：清单校验（只认包根）、`plugins.json` 列表、添加与启用分离、重启生效、esbuild 打包与缓存。
- [x] renderer 插件：`atelier-plugin://` 协议、共享模块表、卡片错误边界。
- [x] 按对象的二进制流通道；插件页（添加、启用、禁用、移除、失败原因）。
- [x] 代理循环返回终止原因。

## 下次继续

- [ ] 会话命名未生效：首页发送后标题未更新。先查 runtime 日志 `Task naming:`；疑为内置 `utility` 角色默认无模型，需回退到首条消息代理的模型或界面提示。
- [ ] 插件配置表单：按 Zod schema 渲染设置页分组，接通 renderer 到 runtime 的配置通道。
- [ ] 打包验证：`npm run package` 后确认 esbuild 从 asar 解出可运行，源码插件在发布构建中加载。
- [ ] 示例插件：验证 renderer 卡片、二进制流、`commands.invoke` 与 prepare 的完整链路。
- [ ] 契约收尾：`src/plugins/contract.ts` 仍含 `AgentCapabilities`、`SessionNode` 与写入回调，`models.run` 迁回 core；agent 从 `plugin.state` 迁到 `plugin.object` 后移除旧入口。
- [ ] 流通道的 main／preload 消息改用 Zod schema 校验。
