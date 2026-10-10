# 功能模块

资源与工具在模型中平级；后端实现和对应 UI 在这里按功能共置。当前内置模块为 `notes/`、`filesystem/`、`agent/`。

## 三个入口

| 文件 | 职责 |
| --- | --- |
| `contract.ts` | 纯 Zod 契约：资源状态、卡片数据、工具实现的 target/result 和稳定 ID/版本 |
| `runtime.ts` | 默认导出 RuntimeModuleFactory，注册资源后端、资源控制器与工具实现；可使用 Node 和注入的存储、会话及配置服务 |
| `renderer.tsx` | 默认导出 RendererModule，声明静态资源展示描述，注册卡片内容、附加操作和结果组件，只依赖纯契约与前端代码 |

`modules/runtime.ts` 与 `modules/renderer.ts` 分别通过 Vite 静态 glob 收集对应入口。新增目录遵守入口约定即可进入构建；两个入口不要相互导入，也不要创建同时导出它们的 barrel。运行时不依赖 React，renderer 不导入 Node/数据库。当前只加载内置源码，不提供第三方安装、动态执行或沙箱。

资源创建与卡片行为通过 `resource.create` / `resource.command` 接入，由资源控制器校验输入并执行；没有对应控制器行为时拒绝命令。模型操作入口和资源授权独立于这些内部应用命令。

## 工具契约与实现

共享工具在 `tools/declarations.ts` 定义身份与 args；例如 `Read` 的 args 是空对象。模块引用同一个契约，不自行声明另一份 read 参数。新工具也可由模块导出纯契约供其他模块引用。

`defineImplementation` 将共享工具、资源契约与实现的 target/result 关联；`implement` 推导 handler 的参数与返回值类型：

```ts
implement(DirectoryRead, {
  async call(state, target, args, { signal, resource }) {
    // state.path 来自资源状态；target.path 来自本实现的定位契约。
    // 在这里校验访问范围、读取文件，并返回契约规定的数据。
    return { kind: "succeeded", data: { path: target.path, text: "…" } };
  },
  toModel: result => result,
});
```

实际例子见 `filesystem/contract.ts` 与 `filesystem/runtime.ts`。`toModel` 可省略，默认使用 data。target 由 handler 直接解释：目录 `{path}`、笔记 null，其他模块可以使用 `{piece}` 等结构。无通用目标解析器，不在公共工具函数里维护资源类型分支。

注册边界负责校验资源状态、target、args 和返回数据。一个资源类型与工具名只能有一个当前实现，同名工具必须遵循同一 args 契约。实现有独立 ID/版本；更改已保存结果的形状或含义时增加版本。读写副作用与并行/顺序策略属于实现，调度器据此执行和分类失败。

外部授权位于 `execution/`：请求开始时按已链接资源匹配工具，再应用 agent.tools/excludeTools。资源实例不持有工具白名单。Weft 固定入口 resource_list/inspect/call 不注册到工具目录。

## 资源后端与视图

`implementResource` 注册状态投影 `project`、实时检查 `inspect` 和可选环境来源 `context`。project 返回卡片契约的数据；包装层生成 `{contract: {id, version}, data}`，经 IPC 发送给前端。

可选 `controller` 负责创建、命令与活动状态。命令经异步准备后须在写入事务中执行会话传入的 `before`，重新确认对象仍在当前路径上。`activity.running` 报告仍会向会话树追加事件的对象 ID，包括代理与其他被捕获的资源；只引用外部状态的持续运行不计入。活动开始、结束经 `SessionHost.progressChanged` 通知。会话仅在全部资源收束后允许回溯，移除对象也要求该对象收束。

`SessionHost.path` 读取当前路径；`SessionHost.commit` 在同步事务中接收成型记录与资源私有状态修改，提交后统一发布持久通知。回调内的 `SessionWriter` 只提供追加、终态与取得续接路径，节点身份、父指针、游标和自动吸附均由会话管理；不向资源控制器暴露可修改的 `SessionTree`。流增量保存在代理执行侧，不作为时间轴记录提交。

`RendererModule.resources` 按资源类型声明静态 `kind / label / icon`，label 在模块中使用应用本地化文案。`ViewRegistry.resource(kind)` 不解析正文、不构造 Body，向对象目录、历史、授权、添加入口和卡片外壳提供同一份识别信息；未知类型回退为通用资源。类型身份重复注册会被拒绝。描述不随实例存储，不包含动态能力与授权。

`cardRenderer(NoteView, …)` 与 `resultRenderer(NoteRead, …)` 使用相同纯契约推导组件 data 类型，并在接收端校验。卡片提供尺寸、Body、可选 Actions；ObjectCard 统一处理框架、拖动、折叠与关闭，ObjectActions 提供对象移除入口。模块不重建这套外壳。

前端目录在应用根通过 ModuleViewsProvider 注入。卡片和对话只消费目录接口，不能导入模块总表，否则会形成“总表 → 代理卡片 → 对话 → 总表”的依赖环。

## 历史

工具结局保存实际实现的 ID/版本，以及执行当时生成的 data/model。历史模型投影读取保存的 model；用户视图按实现 ID/版本读取组件并展示保存的 data。资源已删除或文件已变化，都不触发重新执行或重新读文件。

renderer 可同时注册同一 ID 的多个版本以展示历史；当前执行目录只注册一个适用实现。缺失精确版本或数据不合契约时，宿主显示原始数据。函数、React 组件和后端实例不会进入持久化或 IPC。

卡片视图按资源自身的历史能力投影；目录仍是路径引用，卡片不是文件系统快照。工具结果的当次数据与资源当前内容分别处理。
