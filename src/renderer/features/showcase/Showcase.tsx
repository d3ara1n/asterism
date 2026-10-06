import { Bot, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../../shared/ui/alert";
import { Badge } from "../../shared/ui/badge";
import { Button } from "../../shared/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "../../shared/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../shared/ui/dialog";
import { Input } from "../../shared/ui/input";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "../../shared/ui/item";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../shared/ui/select";
import { Separator } from "../../shared/ui/separator";
import { Switch } from "../../shared/ui/switch";
import { Textarea } from "../../shared/ui/textarea";

/** 隐藏口令，在首页输入框完整输入后回车触发；纯前端彩蛋，不进入命令系统。 */
export const showcaseSpell = "/gamemode 1";

/** 组件展示：只读，集中查看当前主题下公共控件的各种状态。 */
export function Showcase({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader><DialogTitle>Creative mode</DialogTitle><DialogDescription>Components under the current theme.</DialogDescription></DialogHeader>
      <Section title="Button">
        {(["default", "secondary", "outline", "ghost", "destructive", "link"] as const).map(variant => <Button key={variant} size="sm" variant={variant}>{variant}</Button>)}
        <Button size="sm" disabled>disabled</Button><Button size="icon-sm" aria-label="icon"><Bot /></Button>
      </Section>
      <Section title="Badge">{(["default", "secondary", "outline", "destructive"] as const).map(variant => <Badge key={variant} variant={variant}>{variant}</Badge>)}</Section>
      <Section title="Field">
        <Input className="w-48" placeholder="Placeholder" /><Input className="w-48" aria-invalid defaultValue="Invalid" />
        <Input className="w-48" disabled defaultValue="Disabled" />
        <Select defaultValue="a"><SelectTrigger size="sm" className="w-32" aria-label="Select"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="a">Option A</SelectItem><SelectItem value="b">Option B</SelectItem></SelectContent></Select>
        <Switch aria-label="Switch" defaultChecked /><Switch aria-label="Switch off" />
        <Textarea className="w-full" placeholder="A long text area" />
      </Section>
      <Section title="Alert">
        <Alert><Info /><AlertTitle>Default</AlertTitle><AlertDescription>Neutral information.</AlertDescription></Alert>
        <Alert variant="destructive"><Info /><AlertTitle>Destructive</AlertTitle><AlertDescription>Something failed.</AlertDescription></Alert>
      </Section>
      <Section title="Card / Item">
        <Card className="w-56 py-4"><CardHeader className="px-4"><CardTitle>Card</CardTitle><CardDescription>Description text that wraps onto a second line.</CardDescription></CardHeader></Card>
        <ItemGroup className="surface w-72"><Item size="sm"><ItemContent><ItemTitle>Item title</ItemTitle><ItemDescription>An extremely long description that should be truncated or wrapped correctly.</ItemDescription></ItemContent></Item></ItemGroup>
      </Section>
    </DialogContent>
  </Dialog>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="flex flex-col gap-2"><Separator /><h3 className="type-section">{title}</h3><div className="flex flex-wrap items-center gap-2">{children}</div></section>;
}
