# Hashline 核心

纯文本的逐行哈希与批次编辑，移植自 [@d3ara1n/pi-hashline-edit](https://github.com/d3ara1n/pi-extensions/tree/77d1fdfac95eeb3bb8bf0b4383af2d4af0d2655a/packages/pi-hashline-edit/src/core)，源包版本 0.7.1，许可证 MIT。保留其哈希算法、整批校验、位移候选、范围检查和逐行换行保留；JSON 范围起点统一命名为 anchor，参数由 Weft 的 Zod 契约校验。末行孤立的 CR 作为内容保留。

- 哈希来自行号与正文，默认四位 Crockford Base32。短哈希可能碰撞，不是资源身份、版本凭证或授权。
- 所有操作基于同一份当前正文校验；失败整批拒绝，不应用部分操作。
- 首尾锚点只保护被引用的行，不验证整个多行范围的内部内容。
- 锚点位移扫描仅给出重试候选，不自动重定位操作。
- append/prepend 不需要锚点；其他操作从 read 或 edit 结果取得锚点。
- 纯核心不访问文件或存储；资源授权、串行修改、差异生成与实际保存由 Weft 后端负责。

正文工具契约见 [text-contract.ts](../text-contract.ts)，后端公共逻辑见 [text.ts](../text.ts)，正式行为与授权边界见 [运行时文档](../../../docs/runtime.md#原生正文工具)。

源包声明的 MIT 许可：

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
