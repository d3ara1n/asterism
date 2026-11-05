import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { ReferenceChipFace } from "./reference-chip";
import { referenceNodeName } from "./reference-serialization";

/** A reference chip is an inline atom that leaves the editor as a markdown link. */
export interface ReferenceAttrs {
  /** Display label shown in the chip and used as the link text. */
  label: string;
  /** App-defined URL: `resource:<id>/<path>` or `skill:<name>`. */
  href: string;
}

function ReferenceChipView({ node, selected, editor, deleteNode }: NodeViewProps) {
  const { label, href } = node.attrs as ReferenceAttrs;
  return <NodeViewWrapper as="span" className="inline">
    {/* Editability is read at click time; node views do not re-render when the editor locks. */}
    <ReferenceChipFace href={href} selected={selected} onRemove={() => { if (editor.isEditable) deleteNode(); }}>{label}</ReferenceChipFace>
  </NodeViewWrapper>;
}

export const ReferenceChip = Node.create({
  name: referenceNodeName,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      label: { default: "", rendered: false, parseHTML: element => element.getAttribute("data-label") ?? element.textContent ?? "" },
      href: { default: "", rendered: false, parseHTML: element => element.getAttribute("data-href") ?? "" },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-reference-chip]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { label, href } = node.attrs as ReferenceAttrs;
    return ["span", mergeAttributes(HTMLAttributes, { "data-reference-chip": "", "data-label": label, "data-href": href }), label];
  },

  renderText({ node }) {
    const { label, href } = node.attrs as ReferenceAttrs;
    return `[${label}](${href})`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(ReferenceChipView, { as: "span" });
  },
});
