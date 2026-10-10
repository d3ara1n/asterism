# 插件系统

原则见 `docs/decisions.md` 插件相关条目与 `docs/architecture.md#插件`。

## 步骤

1. 内置模块改造为 `atelier.core` 插件：`src/plugins/` 提供 `definePlugin` / `defineModule`、两阶段装配器（失败隔离、命名空间补全、契约覆盖解析、贡献清单）与 plugin api 第一版（`plugin.id/dir/log`，`ctx.resource/state/session`）。三个模块改用短名并只经 plugin api 办事；既有 `core.*` 契约与实现 ID 改为 `atelier.core/*`，孵化期不做数据迁移；renderer 仅随之改 ID。
2. 补齐插件缺席时的实现缺失呈现。
3. plugin api 便利设施：配置 schema 与设置页分组、命名空间凭据、`.atelier/` 托管数据库。
4. `plugin.models`：按模型角色发起对话，不接触密钥；agent 的模型、提供商与凭据调用由此替换内部接口。
5. 拆出版本化的插件 API 契约包与宿主 API 版本检查。
6. 外部加载：npm 安装与版本锁定、用户插件顺序、启用/禁用重启生效、renderer 运行时加载插件视图 bundle。
7. 插件页：身份、版本、贡献与覆盖、占用配置与数据、失败原因。

## 待定

- renderer 运行时加载外部视图的方式（与宿主共享 React 实例等）。
- 模型协议适配是否作为插件贡献（属于配置层，不是资源）。
