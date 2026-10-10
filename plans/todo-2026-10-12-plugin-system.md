# 插件系统

原则见 `docs/decisions.md` 插件相关条目与 `docs/architecture.md#插件`。

## 步骤

已完成：内置模块改造为 `atelier.core` 插件（两阶段装配、命名空间补全、契约覆盖、贡献清单、绑定会话/对象的 context 与 `emit`）；插件缺席时的实现缺失呈现。

3. plugin api 便利设施：配置 schema 与设置页分组、命名空间凭据、`.atelier/` 托管数据库。
4. `plugin.models`：按模型角色发起对话，不接触密钥；agent 的模型、提供商与凭据调用由此替换内部接口。
5. 拆出版本化的插件 API 契约包与宿主 API 版本检查。
6. 外部加载：npm 安装与版本锁定、用户插件顺序、启用/禁用重启生效、renderer 运行时加载插件视图 bundle。
7. 插件页：身份、版本、贡献与覆盖、占用配置与数据、失败原因。

## 遗留

- agent 仍用插件级 `plugin.state` / `plugin.sessions` 手传 ID，随第 4 步迁到绑定 context；之后移除这两个插件级入口。

## 待定

- renderer 运行时加载外部视图的方式（与宿主共享 React 实例等）。
- 模型协议适配是否作为插件贡献（属于配置层，不是资源）。
