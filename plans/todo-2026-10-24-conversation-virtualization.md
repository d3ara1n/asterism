# 代理对话时间线虚拟化

立案日期：2026-10-24

## 目标与范围

代理卡片的对话时间线改为虚拟列表，DOM 规模不随对话长度增长，长会话下画布拖动、缩放与流式输出保持流畅。实测：同一长会话代理卡片折叠时页面元素 171 个，展开时 3320 个（不含代码块 shadow DOM），帧数随对话长度明显下降。

前置已完成（未提交）：Streamdown 只在生成期间及 1 秒排空窗口内挂载；已保存时间线与实时块分开计算，流式增量不重算历史；画布拖动沿用未变化节点的 `data` 身份；`NodeView` memo。

## 已确认的决策

- **块时间入历史**：思考、正文与工具调用块的起止时间写入成型块，重启后照常显示用时，供领域审计。时间不放在视图状态里，视图只读取块数据；进行中的计时由实时块的开始时间推导。
- **采用依赖**：虚拟化使用 `virtua`（动态高度、反向列表、`keepMounted`，LobeHub 同类对话场景在用），不自行实现。引入时锁定确切版本。
- **视图状态跟随对象**：展开／折叠等用户改动过的视图状态按 `timelineKey` 存入对象保留状态（`object.retained`），随对象释放；可从数据推导的不存。
- **插件工具视图契约**：在插件 SDK 文档写明对话时间线是虚拟化的，工具视图会随滚动卸载与重新挂载，状态保持与虚拟化完备由视图实现方负责。
- **不做临时方案**：不先上 `content-visibility` 过渡。

## 待设计与实施

### 1. 块时间持久化

- [ ] `packages/sdk/src/model-records.ts` 的 `modelBlockSchema` 三种块增加生成起止时间（毫秒时间戳，与 `toolInvocationSchema` 一致）；未结束块的结束时间为 null。工具执行时间继续由 `outcome.startedAt / finishedAt` 表达。
- [ ] `src/execution/response.ts` 的 `emitBlock` 写入 `BufferedBlock` 已有的 `startedAt / endedAt`；同步 `ModelBlock` 类型与上下文投影、peek 等构造处。
- [ ] `ThinkingBlock` 去掉 `startedAt / endedAt` 组件状态，已保存块与实时块统一从数据取时间；进行中仍以计时器刷新显示。
- [ ] 孵化期不兼容旧记录：旧块缺时间时按 schema 处理方式在实现时确认（缺失即不显示用时，不迁移）。
- [ ] 更新 `docs/runtime.md`（成型块字段）与 `docs/timeline.md`（如涉及）。

### 2. 视图状态迁出组件

- [ ] `ToolCall`、`ThinkingBlock`、`Summary` 的展开状态改为按 `timelineKey` 读写对象保留状态，默认值仍由偏好与流式状态推导。
- [ ] 核对 `MermaidDiagram` 渲染结果、`Files` 预览、`tool-content` 输入值在重挂载下的表现，必要时改为模块级缓存或保留状态。
- [ ] 此步完成后行为不变，可单独验收。

### 3. 接入虚拟列表

- [ ] 确认依赖引入（版本、体积、React 19 兼容），`ConversationTimeline` 改用 `virtua`。
- [ ] 正在生成的块与末尾若干条保持挂载；上方条目高度变化时维持阅读位置。
- [ ] 验证 React Flow 缩放变换下高度测量正确（布局尺寸而非缩放后尺寸）。

### 4. 滚动行为

- [ ] `useOutputFollow` 改用虚拟列表接口跟随最新输出。
- [ ] Minimap 跳转改为按 key／index 定位，不依赖已挂载 DOM。

### 5. 契约与收尾

- [ ] `docs/plugin-sdk.md` 写明工具视图虚拟化契约；`docs/workbench.md` 更新代理卡片时间线说明。
- [ ] `docs/decisions.md` 归档本次取舍（块时间入历史、采用 virtua、视图状态随对象、插件负责虚拟化完备）。
- [ ] 验收：长会话展开后元素数量不随对话长度增长；拖动、缩放、流式输出帧数与短会话接近；重启后思考与工具用时照常显示；展开状态滚动往返不丢。
- [ ] 已知限制写入文档：跨已卸载条目的文本选择与页面内查找只覆盖已挂载部分。

## 参考入口

- [对话时间线投影](../packages/builtin/src/agent/conversation/timeline.ts)
- [对话组件](../packages/builtin/src/agent/conversation/Conversation.tsx)
- [响应块缓冲](../src/execution/response.ts)
- [成型块 schema](../packages/sdk/src/model-records.ts)
- LobeHub 用 `keepMounted` 固定生成中消息：lobehub/lobehub PR #14086
