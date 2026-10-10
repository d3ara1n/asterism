# 插件系统

原则见 `docs/decisions.md` 插件相关条目与 `docs/architecture.md#插件`。

## 步骤

1. 内置模块改造为内置插件：引入 `definePlugin` / `defineModule`，按插件构造 plugin api；内置模块只经 plugin api 与资源契约办事，`RuntimeServices` 收为宿主内部实现。暴露的缺口即 API 第一版。
2. 贡献 ID 命名空间定型，含既有 `core.*` 的归属；补齐插件缺席时的实现缺失呈现。
3. plugin api 便利设施：配置 schema 与设置页分组、命名空间凭据、私有数据目录、带身份日志。
4. 拆出版本化的插件 API 契约包与宿主 API 版本检查。
5. 外部加载：npm 安装与版本锁定、启用/禁用重启生效、加载失败隔离、renderer 运行时加载插件视图 bundle。
6. 插件页：身份、版本、贡献、占用配置与数据、失败原因。

## 待定

- renderer 运行时加载外部视图的方式（与宿主共享 React 实例等）。
- 模型协议适配是否作为插件贡献（属于配置层，不是资源）。
- 卸载时是否清理插件命名空间数据。
