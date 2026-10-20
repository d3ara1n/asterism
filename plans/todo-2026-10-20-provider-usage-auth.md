# 提供商认证与后续查询接入

立案日期：2026-10-20。

预设组合、插件提供的预设／用量查询目录、内置余额／套餐查询和独立 toolbar 消费已有实现；最终规则见 [提供商预设与账户用量](../docs/model-configuration.md#提供商预设)、[SDK 提供商贡献](../docs/plugin-sdk.md#提供商贡献与账户用量api-92)与[账户用量工具栏](../docs/workbench.md#账户用量工具栏)。本计划只维护尚未实施的事项。

## 认证与配置演进

- OAuth 是认证方式的组合：通用认证界面根据所需交互呈现登录流程，厂商差异留在具体认证实现；不引入 `if provider kind` 的编辑器或模型执行分支。
- 按实际接入需要设计认证的判别联合、公开配置与加密凭据结构；不为尚未实现的方式增加空数据容器或伪登录入口。
- 固定认证方式不影响填写／替换凭据、登录或退出。保留现有主进程加解密与运行时凭据消费边界。
- 提供商地址字段 `baseUrl` 更名为 `endpoint` 与认证配置结构调整一起评估，统一处理存储和消费方，不仅修改界面或留下双字段来源。

## 后续查询资料

当前支持范围以[内置查询目录](../docs/model-configuration.md#内置查询目录)为准。其他提供方尚未指定实施顺序，接入时重新核验接口、鉴权与产品准入，不直接照搬旧地址。Kimi Code 的额外充值钱包待取得可靠的字段与金额单位依据后再适配。

- 本地参考：`../pi-extensions/packages/pi-usage-block`。
- AstrLink：[配额查询](https://github.com/Calcium-Ion/AstrLink/blob/main/core/internal/codingplan/usage.go)。
- CC Switch：[余额查询](https://github.com/farion1231/cc-switch/blob/main/src-tauri/src/services/balance.rs)。
- 官方接口：[DeepSeek 余额](https://api-docs.deepseek.com/api/get-user-balance)、[OpenRouter 当前 key](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key)、[OpenRouter credits](https://openrouter.ai/docs/api/api-reference/credits/get-credits)。

## 完成条件

- OAuth 进入实施范围后，验证登录、刷新、退出和失效凭据处理。
- 余额与其他套餐查询按实际提供方接入时分别验证接口、凭据边界和展示。
- 将最终规则移入对应真值文档，后续事项全部结束后归档本计划。
