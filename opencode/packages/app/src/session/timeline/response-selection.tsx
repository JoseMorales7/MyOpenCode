import { createEffect, For, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Portal } from "solid-js/web"
import { Button } from "@opencode/ui/button"
import {
  SelectionAction,
  type MountedSession,
  type ResponseSelection,
  type SessionScreen,
} from "@opencode/gui-extensions/sdk"
import type { SessionMessageInfo } from "@opencode/client/promise"
import { Session } from "@opencode/schema/session"
import { SessionMessage } from "@opencode/schema/session-message"
import { Timeline } from "@opencode/session-ui/timeline/projection"
import { useExtensionHost } from "@/runtime/extension/host"
import { useLanguage } from "@/runtime/i18n/language"

/** One delegated controller per active timeline, not one subscription per virtual row. */
export function ResponseSelectionToolbar(props: {
  active: boolean
  root: () => HTMLDivElement | undefined
  session: MountedSession
  screen: SessionScreen
  messages: () => ReadonlyMap<string, SessionMessageInfo>
}) {
  const host = useExtensionHost()
  const language = useLanguage()
  const [store, setStore] = createStore<{ selection?: ResponseSelection & { left: number; top: number } }>({})
  let toolbar: HTMLDivElement | undefined

  createEffect(() => {
    const owner = props.session
    setStore("selection", undefined)

    if (!props.active) return

    const capture = () => {
      const selection = window.getSelection()
      const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined
      const element = (node: Node) => (node instanceof Element ? node : node.parentElement)
      const start = range && element(range.startContainer)?.closest('[data-component="text-part"]')
      const end = range && element(range.endContainer)?.closest('[data-component="text-part"]')
      const body = start?.querySelector('[data-slot="text-part-body"]')
      const text = range?.toString()

      if (
        !range ||
        range.collapsed ||
        !start ||
        start !== end ||
        !body ||
        !text?.trim() ||
        text.length > 131_072 ||
        !props.root()?.contains(start) ||
        !body.contains(range.startContainer) ||
        !body.contains(range.endContainer)
      ) {
        setStore("selection", undefined)

        return
      }

      const partID = start.getAttribute("data-timeline-part-id")

      const message = Array.from(props.messages().values()).find(
        (message) =>
          message.type === "assistant" && Timeline.contentEntries(message).some((part) => part.id === partID),
      )

      if (message?.type !== "assistant" || !partID) return
      const rect = range.getBoundingClientRect()

      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        setStore("selection", undefined)

        return
      }

      const prefix = document.createRange()
      prefix.selectNodeContents(body)
      prefix.setEnd(range.startContainer, range.startOffset)
      const startOffset = prefix.toString().length
      setStore("selection", {
        session: owner,
        screen: props.screen,
        completed: message.time.completed !== undefined,
        quote: {
          id: crypto.randomUUID(),
          text,
          source: {
            serverID: owner.server.id,
            sessionID: Session.ID.make(owner.id),
            messageID: SessionMessage.ID.make(message.id),
            partID,
            startOffset,
            endOffset: startOffset + range.toString().length,
          },
        },
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 280)),
        top: Math.max(8, rect.top - 42),
      })
    }

    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setStore("selection", undefined)
    }

    const pointer = (event: PointerEvent) => {
      if (event.target instanceof Node && toolbar?.contains(event.target)) return
      setStore("selection", undefined)
    }

    document.addEventListener("selectionchange", capture)
    document.addEventListener("pointerup", capture)
    document.addEventListener("pointerdown", pointer)
    document.addEventListener("keydown", key)
    window.addEventListener("scroll", capture, true)
    window.addEventListener("resize", capture)
    onCleanup(() => {
      document.removeEventListener("selectionchange", capture)
      document.removeEventListener("pointerup", capture)
      document.removeEventListener("pointerdown", pointer)
      document.removeEventListener("keydown", key)
      window.removeEventListener("scroll", capture, true)
      window.removeEventListener("resize", capture)
    })
  })

  const run = (action: (input: ResponseSelection) => void) => {
    const selected = store.selection

    if (!selected || selected.session.key !== props.session.key) return
    action(selected)
    window.getSelection()?.removeAllRanges()
    setStore("selection", undefined)
  }

  return (
    <Show when={store.selection}>
      {(selected) => (
        <Portal>
          <div
            ref={toolbar}
            role="toolbar"
            aria-label={language.t("quote.actions")}
            class="fixed z-50 flex gap-1 rounded-lg border border-v2-border-border-base bg-v2-background-bg-base p-1 shadow-lg"
            style={{ left: `${selected().left}px`, top: `${selected().top}px` }}
            onPointerDown={(event) => event.preventDefault()}
          >
            <Button
              size="small"
              variant="ghost"
              onClick={() =>
                run((input) => {
                  input.screen.composer.attach({ type: "quote", quote: input.quote, commentID: input.quote.id })
                  document.querySelector<HTMLElement>('[data-component="composer-editor"]')?.focus()
                })
              }
            >
              {language.t("quote.askHere")}
            </Button>
            <For each={host.items(SelectionAction)}>
              {(action) => (
                <Button size="small" variant="ghost" onClick={() => run(action.value.run)}>
                  {action.value.title}
                </Button>
              )}
            </For>
          </div>
        </Portal>
      )}
    </Show>
  )
}
