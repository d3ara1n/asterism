import { useI18n, useRendererViewState } from "@asterism-app/sdk/renderer";
import { Markdown } from "@asterism-app/ui/markdown";
import { Button } from "@asterism-app/ui/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@asterism-app/ui/ui/collapsible";
import { Marker, MarkerContent, MarkerIcon } from "@asterism-app/ui/ui/marker";
import { ChevronRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { conversationMessages } from "../../messages/conversation";
import { conversationTransition, immediateTransition } from "./motion";
import { viewStateKeys } from "./view-state";

/** The saved summary replaces the earlier prefix in this reading window; expanding never loads the original records. */
export function CompressionSummary({ text }: { text: string }) {
  const i18n = useI18n();
  const [open, setOpen] = useRendererViewState(viewStateKeys.disclosure, false);
  const reducedMotion = useReducedMotion();
  return <Collapsible open={open} onOpenChange={setOpen}>
    <Marker variant="separator" asChild><CollapsibleTrigger asChild>
      <Button type="button" variant="ghost" size="sm" className="w-full gap-2 px-0 text-xs font-normal text-muted-foreground">
        <MarkerIcon className="size-3.5"><motion.span className="block" initial={false}
          animate={{ rotate: open ? 90 : 0 }} transition={reducedMotion ? immediateTransition : conversationTransition}>
          <ChevronRight className="size-3.5" />
        </motion.span></MarkerIcon>
        <MarkerContent>{i18n.text(conversationMessages.compressedHistory)}</MarkerContent>
      </Button>
    </CollapsibleTrigger></Marker>
    <CollapsibleContent className="pt-2"><Markdown>{text}</Markdown></CollapsibleContent>
  </Collapsible>;
}
