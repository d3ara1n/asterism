import { useLayoutEffect, useRef } from "react";
import { runScopeHandlers, type EditorView } from "@codemirror/view";
import { SearchQuery, setSearchQuery, findNext, findPrevious, replaceNext, replaceAll, selectMatches, closeSearchPanel } from "@codemirror/search";
import { useI18n } from "@asterism-app/sdk/renderer";
import { ArrowDown, ArrowUp, CaseSensitive, Regex, WholeWord, X } from "lucide-react";
import { InputGroup, InputGroupInput, InputGroupAddon, InputGroupButton } from "@asterism-app/ui/ui/input-group";
import { Button } from "@asterism-app/ui/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@asterism-app/ui/ui/toggle-group";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { editorMessages as messages } from "../messages/editor";

export function SearchPanel({ view, query, readOnly }: { view: EditorView; query: SearchQuery; readOnly: boolean }) {
  const i18n = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const replacement = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => { input.current?.focus(); input.current?.select(); view.requestMeasure(); }, [view]);
  const update = (patch: Partial<SearchQuery>) => view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ ...query, ...patch })) });
  const close = () => { closeSearchPanel(view); view.focus(); };
  return <div className="flex flex-col gap-2 p-3" role="search" aria-label={i18n.text(messages.find)}
    onKeyDown={event => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (event.key === "Enter" && (event.target === input.current || event.target === replacement.current)) {
        event.preventDefault(); event.stopPropagation();
        if (query.valid) (event.target === replacement.current ? replaceNext : event.shiftKey ? findPrevious : findNext)(view);
        return;
      }
      if (runScopeHandlers(view, event.nativeEvent, "search-panel")) { event.preventDefault(); event.stopPropagation(); }
    }}>
    <InputGroup>
      <InputGroupInput ref={input} main-field="true" value={query.search} autoComplete="off" spellCheck={false}
        aria-label={i18n.text(messages.searchText)} placeholder={i18n.text(messages.searchText)}
        aria-invalid={!!query.search && !query.valid}
        onChange={event => update({ search: event.target.value })} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="icon-xs" disabled={!query.valid} aria-label={i18n.text(messages.previousMatch)} onClick={() => findPrevious(view)}><ArrowUp /></InputGroupButton>
        <InputGroupButton size="icon-xs" disabled={!query.valid} aria-label={i18n.text(messages.nextMatch)} onClick={() => findNext(view)}><ArrowDown /></InputGroupButton>
        <InputGroupButton size="icon-xs" aria-label={i18n.text(commonMessages.close)} onClick={close}><X /></InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
    {!readOnly && <InputGroup>
      <InputGroupInput ref={replacement} value={query.replace} autoComplete="off" spellCheck={false}
        aria-label={i18n.text(messages.replaceText)} placeholder={i18n.text(messages.replaceText)}
        onChange={event => update({ replace: event.target.value })} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton disabled={!query.valid} onClick={() => replaceNext(view)}>{i18n.text(messages.replace)}</InputGroupButton>
        <InputGroupButton disabled={!query.valid} onClick={() => replaceAll(view)}>{i18n.text(messages.replaceAll)}</InputGroupButton>
      </InputGroupAddon>
    </InputGroup>}
    <div className="flex items-center justify-between gap-2">
      <ToggleGroup type="multiple" size="sm"
        value={[query.caseSensitive && "case", query.wholeWord && "word", query.regexp && "regexp"].filter((value): value is string => !!value)}
        onValueChange={values => update({ caseSensitive: values.includes("case"), wholeWord: values.includes("word"), regexp: values.includes("regexp") })}>
        <ToggleGroupItem value="case" aria-label={i18n.text(messages.matchCase)} title={i18n.text(messages.matchCase)}><CaseSensitive /></ToggleGroupItem>
        <ToggleGroupItem value="word" aria-label={i18n.text(messages.wholeWord)} title={i18n.text(messages.wholeWord)}><WholeWord /></ToggleGroupItem>
        <ToggleGroupItem value="regexp" aria-label={i18n.text(messages.regexp)} title={i18n.text(messages.regexp)}><Regex /></ToggleGroupItem>
      </ToggleGroup>
      <Button type="button" variant="ghost" size="sm" disabled={!query.valid} onClick={() => { selectMatches(view); view.focus(); }}>
        {i18n.text(messages.selectAllMatches)}
      </Button>
    </div>
    {!!query.search && !query.valid && <Alert variant="destructive"><AlertDescription>{i18n.text(messages.invalidSearch)}</AlertDescription></Alert>}
  </div>;
}
