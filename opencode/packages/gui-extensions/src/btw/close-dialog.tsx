import { onCleanup } from "solid-js"
import { Button } from "@opencode/ui/button"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@opencode/ui/dialog"
import { useExtension } from "../sdk"

export default function CloseSideChat(props: { close: () => void; confirm: () => void; cancel: () => void }) {
  const ctx = useExtension()
  let confirmed = false
  onCleanup(() => {
    if (!confirmed) props.cancel()
  })

  return (
    <Dialog>
      <DialogHeader>
        <DialogTitle>{ctx.t("thread.closeTitle")}</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <p class="p-4 text-14-regular">{ctx.t("thread.closeDescription")}</p>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={props.close}>
          {ctx.t("thread.cancel")}
        </Button>
        <Button
          onClick={() => {
            confirmed = true
            props.confirm()
            props.close()
          }}
        >
          {ctx.t("thread.closeConfirm")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
