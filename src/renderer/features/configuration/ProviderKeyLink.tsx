import { ExternalLink } from "lucide-react";

export function ProviderKeyLink({ href, children }: { href: string; children: string }) {
  return <a href={href} target="_blank" rel="noopener noreferrer"
    className="type-caption inline-flex items-center gap-1 self-start px-1 hover:text-foreground">
    {children}<ExternalLink className="size-3" aria-hidden="true" />
  </a>;
}
