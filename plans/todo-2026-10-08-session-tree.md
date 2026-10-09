# 会话级扁平树改造

> 立案 2026-10-08。语义见 `docs/timeline.md`、`docs/object-model.md`、`docs/conversation-core.md`。现有开发数据直接丢弃，存储版本 3 不做迁移。

## 第一批：存储、运行时、投影（一起交付）

- [x] 存储版本 3：`sessions` 索引与会话级节点表（id、session_id、parent_id、agent_id、kind、response_id、ordinal、complete、recorded_at、payload），游标为追加记录；移除 `tasks.branch_id`、线性 `events` 与每代理 conversation 事件；代理选择按代理对象保存。
- [x] `history/` 与 `conversation/` 合并为会话树模块：追加校验、祖先路径、路径折叠出工作台对象与链接。
- [x] 运行时：流增量只在内存，块完成追加；中断时以 complete=false 追加；toolcall 取得结局后与结果一并追加；无块失败发错误级 notice。
- [x] 模型投影：按 agent 过滤、按 response_id/序号归组、展开 tool 结果、响应期间事件延后、跳过不完整块。
- [x] 回溯：会话 settled 才可 select；继续点 thinking 结尾时退到合法祖先。
- [x] IPC 版本 2：`session` 通道；renderer 控制器与工作台改读新投影。
- [x] Task 全面改名 Session（代码、命令、测试）。
- [x] typecheck 与契约测试：投影归组与延后、序号排序、不完整块跳过、吸附、并行代理节点交错、settled 约束、幂等提交。

## 第二批

- [x] 资源 created / 加入移除工作台 / attach / detach 事件节点；链接通知投影给模型，加入移除只重建视图。
- [x] `resource_list` / `resource_inspect` / `resource_call` 骨架；笔记 read 迁入。
- [x] 代理控制器读取已链接目录的 AGENTS.md 组装系统提示词。
- [x] notice 通道接入错误、缓存过期、预算提示。

## 实测后再定

- [ ] 动态工具调用可靠性；不理想时改为链接时合并加入顶层 tools。
- [ ] 只截掉末尾 toolcall 的投影在三协议的接受情况。
- [ ] 代理间通信工具与“子代理” skill；对象自身事件机制（如象棋）。
