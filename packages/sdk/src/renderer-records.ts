import { createElement, type ComponentType, type ReactNode } from "react";
import type { UiText } from "./i18n.ts";
import type { Json } from "./json.ts";
import { reference, type ContractReference } from "./presentation.ts";
import type { RecordContract, SessionRecord } from "./records.ts";

/** 宿主提供的查询：记录只携带身份，标题与类型名由宿主按整份历史解析。 */
export interface RecordRenderContext {
  /** 整棵历史中对象的标题；已移除或位于其他分支的对象仍可解析。 */
  resourceTitle(id: string): string;
  resourceLabel(kind: string): UiText;
  /** 按当前界面语言把文案格式化为纯文本，供组合摘要使用。 */
  text(value: UiText): string;
  /** 包装其他记录的契约借用被包装记录的视图；未注册或无法解码时返回 null。 */
  describe(record: SessionRecord): RecordView | null;
}
export interface RecordRowProps<D> { data: D; record: SessionRecord; label: string }
export interface RecordRendererDefinition<D> {
  /** 纯文本摘要，用于搜索、提示与无障碍名称；必须提供。 */
  label(data: D, context: RecordRenderContext, record: SessionRecord): UiText;
  icon?: ReactNode | ((data: D, record: SessionRecord) => ReactNode);
  /** 可选的摘要行内容；行外壳（选中、位置标记、来源、菜单）归宿主。 */
  Row?: ComponentType<RecordRowProps<D>>;
}
export interface RecordView {
  label: UiText;
  icon?: ReactNode;
  /** 以宿主格式化后的摘要生成行内容；未提供时宿主显示摘要文本。 */
  row?(label: string): ReactNode;
}
export interface RecordRenderer {
  contract: ContractReference;
  resolve(record: SessionRecord, context: RecordRenderContext): RecordView | null;
}

/** 按记录契约声明历史展示；数据通过契约解码才进入视图，失败由宿主显示未知记录。 */
export function recordRenderer<D extends Json>(contract: RecordContract<D>, definition: RecordRendererDefinition<D>): RecordRenderer {
  return { contract: reference(contract), resolve(record, context) {
    const decoded = contract.decode(record);
    if (decoded?.status !== "known") return null;
    const { data } = decoded;
    const { Row, icon } = definition;
    return {
      label: definition.label(data, context, record),
      icon: typeof icon === "function" ? icon(data, record) : icon,
      row: Row ? label => createElement(Row, { data, record, label }) : undefined,
    };
  } };
}
