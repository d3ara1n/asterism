# 跨模型续接

> 立案 2026-10-13，自模型接入计划拆出。已与 [模型兼容计划](todo-2026-10-10-model-compatibility.md) 的 L2b 共用单次目标投影，GUI 与真实端点待验收。上下文压缩不属于本计划。

## 已实现机制

- 时间线保存公共 thinking／text／toolcall 内容及原生附加资料，不保存第二份模型上下文。每次请求从当前时间线向目标模型投影，转换不回写历史、不追加桥接消息、不生成摘要或来源水印。
- 取消整段历史必须与目标 scope／adapter 一致的拒绝。来源作用域（provider 身份、协议、端点、模型）和适配版本只决定原生附加资料能否复用；其他来源的公共回答、工具调用与结果继续参与请求。
- OpenAI Responses 无状态基线回传可复用密文，Anthropic 回传可复用的签名或 redactedData；这些是正常协议行为，不需要兼容包。只有 item ID 而没有密文，不能替代 store:false 的原生思考续接。
- 目标无法表达的无签名／无密文思考仅从本次请求省略，不默认伪装成助手正文、不伪造原生资料。启用 thinkingInDeepSeekFormat 时，可见思考按原位置投影为明文 reasoning item；可见内容可能是全文或摘要，不宣称能从密文恢复缺失文字。
- reasoning:false 仍过滤当前请求的全部历史思考；公共模型／等级 null 继承和 off 语义不变。
- 外来工具调用 ID 若不满足通用字符／长度范围，或与原生／先前调用身份冲突，则确定性转换，并将结果同步映射到相同 ID。本来源原始身份优先保留。
- A → B → A 不会逐次转换保存内容；A 原先的原生资料一直留在时间线，切回时可重新使用。B 产生的公共回答保留，不携带不适用的 B 原生资料。
- 实现入口：src/model/projection.ts、src/model/continuation.ts；公共 SDK ModelBlock／ModelPart 存储结构不变。

## 验收

- [x] 隔离协议测试：跨模型或适配版本变化不阻断公共正文，不泄漏来源签名／密文／item ID。
- [x] 隔离协议测试：OpenAI 与 Anthropic 原生续接无需兼容包；A → B → A 中 A 的原有输入前缀一致，B 的公共回答继续参与，历史不改写。
- [x] 隔离协议测试：外来工具 ID 规范化与冲突处理后，调用和结果仍配对；本来源 ID 保留。
- [ ] GUI：已有对话切换模型后继续，切回后历史展示不变。
- [ ] 真实端点：跨 OpenAI／Anthropic／DeepSeek 的正常续接及工具循环。

自动化使用合成协议样本和注入传输；不以它替代真实端点与 GUI 验收。SDK 对模型名称的内置推断、各端点的实际限制仍可能影响请求接受情况，不宣称任意来源的全部不透明资料都可移植。

## 调研依据

核验日期 2026-10-14；外部源码只作机制参考。

- [pi transformMessages，固定提交 3daa202](https://github.com/badlogic/pi-mono/blob/3daa20280f6a7c7cbe0935680c9a38fdc3863005/packages/ai/src/api/transform-messages.ts)：请求时转换思考、签名和工具 ID，不改写原消息。
- [Roo Code 消息转换，快照 137d3f4f](https://github.com/RooCodeInc/Roo-Code/blob/137d3f4f/src/api/transform/openai-format.ts)：保存规范历史，按 API 配置在请求时转换。
- [OpenCode 上下文契约](https://github.com/anomalyco/opencode/blob/dev/CONTEXT.md)：持久历史与目标请求投影分离；链接随上游变化。
