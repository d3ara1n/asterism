import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useRendererObject } from "@asterism-app/sdk/renderer";
import { ReferenceChip as ReferenceChipControl } from "@asterism-app/ui/reference-chip";
import { referenceNodeName } from "./reference-serialization";

/** A reference chip is an inline atom that leaves the editor as a markdown link. */
export interface ReferenceAttrs {
  /** Display label shown in the chip and used as the link text. */
  label: string;
  /** App-defined reference URL, such as `resource:<id>/<path>`, `skill:<name>`, or `model:<provider>/<model>`. */
  href: string;
}

/** Node views render through the editor's React portals, so the Agent's object and skill reference contexts apply. */
function ReferenceChipView({ node, selected, editor, deleteNode }: NodeViewProps) {
  const { label, href } = node.attrs as ReferenceAttrs;
  const object = useRendererObject();
  return <NodeViewWrapper as="span" className="inline">
    {/* Editability is read at click time; node views do not re-render when the editor locks. */}
    <ReferenceChipControl href={href} sessionId={object.ref.sessionId} selected={selected}
      onRemove={() => { if (editor.isEditable) deleteNode(); }}>{label}</ReferenceChipControl>
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
