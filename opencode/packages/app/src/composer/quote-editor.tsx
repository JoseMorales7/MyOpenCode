import { createStore } from "solid-js/store"
import { Dialog, DialogBody, DialogHeader, DialogTitle } from "@opencode/ui/dialog"
import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { useLanguage } from "@/runtime/i18n/language"
import type { QuoteContextItem } from "./schema"

export function QuoteEditor(props: { item: QuoteContextItem; onChange: (comment: string) => void }) {
  const language = useLanguage()
  const dialog = useDialog()
  const [store, setStore] = createStore({ comment: props.item.comment ?? props.item.quote.comment ?? "" })

  return (
    <Dialog>
      <DialogHeader>
        <DialogTitle>{language.t("quote.title")}</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <form
          class="flex flex-col gap-3 p-4"
          onSubmit={(event) => {
            event.preventDefault()
            props.onChange(store.comment)
            dialog.close()
          }}
        >
          <blockquote class="max-h-60 overflow-auto whitespace-pre-wrap border-l-2 border-v2-border-border-base pl-3 text-13-regular">
            {props.item.quote.text}
          </blockquote>
          <textarea
            autofocus
            rows={3}
            aria-label={language.t("quote.comment")}
            placeholder={language.t("quote.comment")}
            class="w-full rounded-md border border-v2-border-border-base bg-transparent p-2 text-14-regular"
            value={store.comment}
            onInput={(event) => setStore("comment", event.currentTarget.value)}
          />
          <Button type="submit">{language.t("common.save")}</Button>
        </form>
      </DialogBody>
    </Dialog>
  )
}
