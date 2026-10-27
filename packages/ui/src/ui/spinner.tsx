import { useI18n } from "@asterism-app/sdk/renderer";
import { Loader2Icon } from "lucide-react";

import { commonMessages } from "../messages/common";
import { cn } from "../utils";

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  const i18n = useI18n()
  return (
    <Loader2Icon
      role="status"
      aria-label={i18n.text(commonMessages.loading)}
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
