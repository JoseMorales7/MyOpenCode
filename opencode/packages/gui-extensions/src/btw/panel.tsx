import { createMemo, createSignal, For, Match, on, onCleanup, onMount, Show, Switch } from "solid-js"
import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { ScrollView } from "@opencode/ui/scroll-view"
import { TextShimmer } from "@opencode/ui/text-shimmer"
import { Tooltip } from "@opencode/ui/tooltip"
import { showToast } from "@opencode/ui/toast"
import { Markdown } from "@opencode/session-ui/markdown"
import { createKeyed, useExtension, usePanel, type MountedSession } from "../sdk"
import type { BtwModel } from "./model"

type PanelInput = { btw: BtwModel; session: MountedSession; id: string }

export default function SessionBtwPanel(props: PanelInput) {
  return (
    <Show when={props.btw.thread(props.session, props.id)} fallback={<LegacyBtwPanel {...props} />}>
      <SideChatPanel {...props} />
    </Show>
  )
}

function SideChatPanel(props: PanelInput) {
  const ctx = useExtension()
  const panel = usePanel()
  const thread = () => props.btw.thread(props.session, props.id)
  const pending = () => props.btw.pending(props.id)
  const failed = () => !pending() && thread()?.messages.at(-1)?.role === "user"
  const hints = { conversation: "context.boundary", selection: "context.selectionHint", fresh: "context.freshHint" }
  let editor: HTMLTextAreaElement | undefined
  let viewport: HTMLDivElement | undefined
  onMount(() => {
    if (panel.visible()) editor?.focus()
  })
  createKeyed(
    () => panel.visible() && props.btw.focus(props.id),
    () => editor?.focus(),
  )
  // Keep only the panel's own viewport at its newest side message.
  createKeyed(
    () => thread()?.messages.length,
    () => {
      const frame = requestAnimationFrame(() => {
        if (viewport) viewport.scrollTop = viewport.scrollHeight
      })

      onCleanup(() => cancelAnimationFrame(frame))
    },
  )

  return (
    <div class="flex h-full min-h-0 flex-col bg-v2-background-bg-base" data-slot="session-btw-panel">
      <div class="flex shrink-0 flex-col gap-2 border-b border-v2-border-border-base p-4">
        <div class="flex items-center justify-between gap-2">
          <span class="text-13-regular">{ctx.t("thread.title")}</span>
          <Button size="small" variant="ghost" onClick={() => props.btw.open()}>
            {ctx.t("thread.new")}
          </Button>
          <Show when={ctx.layout.narrow()}>
            <Button
              size="small"
              variant="ghost"
              onClick={() => ctx.layout.close(`${ctx.id}:${props.id}`, props.session)}
            >
              {ctx.t("thread.close")}
            </Button>
          </Show>
        </div>
        <label class="flex items-center justify-between gap-2 text-13-regular">
          {ctx.t("context.label")}
          <select
            aria-label={ctx.t("context.label")}
            class="max-w-[65%] rounded border border-v2-border-border-base bg-v2-background-bg-base p-1"
            disabled={thread()?.started}
            value={thread()?.mode}
            onChange={(event) => {
              const mode = event.currentTarget.value

              if (mode === "conversation" || mode === "selection" || mode === "fresh")
                props.btw.edit(props.session, props.id, { mode })
            }}
          >
            <option value="conversation" disabled={!thread()?.through}>
              {ctx.t("context.conversation")}
            </option>
            <option value="selection" disabled={!thread()?.quotes.length}>
              {ctx.t("context.selection")}
            </option>
            <option value="fresh">{ctx.t("context.fresh")}</option>
          </select>
        </label>
        <p class="text-12-regular text-text-weak" title={thread()?.through}>
          {ctx.t(hints[thread()?.mode ?? "fresh"])}
        </p>
        <Show when={thread()?.started}>
          <p class="text-12-regular text-text-weak">{ctx.t("context.locked")}</p>
        </Show>
      </div>
      <div class="relative min-h-0 flex-1">
        <ScrollView
          class="absolute inset-0"
          viewportRef={(element) => {
            viewport = element
          }}
        >
          <div class="flex flex-col gap-4 p-4">
            <For each={thread()?.quotes}>
              {(quote) => (
                <div class="flex flex-col gap-2 rounded-md border border-v2-border-border-base p-3">
                  <blockquote class="max-h-40 overflow-auto whitespace-pre-wrap border-l-2 border-v2-border-border-base pl-2 text-13-regular">
                    {quote.text}
                  </blockquote>
                  <textarea
                    rows={2}
                    aria-label={ctx.t("quote.comment")}
                    placeholder={ctx.t("quote.comment")}
                    disabled={thread()?.started}
                    class="rounded border border-v2-border-border-base bg-transparent p-2 text-13-regular"
                    value={quote.comment ?? ""}
                    onInput={(event) => props.btw.quote(props.session, props.id, quote.id, event.currentTarget.value)}
                  />
                  <Show when={!thread()?.started}>
                    <Button
                      size="small"
                      variant="ghost"
                      onClick={() => props.btw.quote(props.session, props.id, quote.id)}
                    >
                      {ctx.t("quote.remove")}
                    </Button>
                  </Show>
                </div>
              )}
            </For>
            <For each={thread()?.messages}>
              {(message) => (
                <article
                  aria-label={ctx.t(message.role === "user" ? "thread.user" : "thread.assistant")}
                  class="min-w-0"
                >
                  <div class="mb-1 text-12-regular text-text-weak">
                    {ctx.t(message.role === "user" ? "thread.user" : "thread.assistant")}
                  </div>
                  <Show
                    when={message.role === "assistant"}
                    fallback={<p class="whitespace-pre-wrap text-14-regular">{message.text}</p>}
                  >
                    <Markdown text={message.text} class="text-14-regular" />
                  </Show>
                </article>
              )}
            </For>
            <Show when={pending()}>
              <div role="status" class="text-13-regular">
                <TextShimmer text={ctx.t("session.timeline.working")} active />
              </div>
            </Show>
            <Show when={failed()}>
              <div role="alert" class="flex flex-col gap-2 text-13-regular">
                <span>{ctx.t("error")}</span>
                <Button size="small" variant="outline" onClick={() => props.btw.send(props.session, props.id, true)}>
                  {ctx.t("retry")}
                </Button>
              </div>
            </Show>
          </div>
        </ScrollView>
      </div>
      <form
        class="flex shrink-0 flex-col gap-2 border-t border-v2-border-border-base p-3"
        onSubmit={(event) => {
          event.preventDefault()
          props.btw.send(props.session, props.id)
        }}
      >
        <textarea
          ref={editor}
          rows={3}
          maxLength={131_072}
          aria-label={ctx.t("thread.question")}
          placeholder={ctx.t("thread.placeholder")}
          class="w-full resize-none rounded-md border border-v2-border-border-base bg-transparent p-2 text-14-regular"
          value={thread()?.draft ?? ""}
          onInput={(event) => props.btw.edit(props.session, props.id, { draft: event.currentTarget.value })}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || event.isComposing) return
            event.preventDefault()
            props.btw.send(props.session, props.id)
          }}
        />
        <div class="flex justify-end">
          <Show
            when={pending()}
            fallback={
              <Button type="submit" size="small" disabled={!thread()?.draft.trim()}>
                {ctx.t("thread.send")}
              </Button>
            }
          >
            <Button type="button" size="small" variant="outline" onClick={() => props.btw.stop(props.id)}>
              {ctx.t("thread.stop")}
            </Button>
          </Show>
        </div>
        <p class="text-12-regular text-text-weak">{ctx.t("thread.retention")}</p>
      </form>
    </div>
  )
}

function LegacyBtwPanel(props: PanelInput) {
  const ctx = useExtension()
  const system = ctx.system
  const answer = () => props.btw.answer(props.session, props.id)
  // A new token for each answer, so the copied mark clears when the answer changes.
  const shown = createMemo(on(answer, () => ({})))
  const [copiedAnswer, setCopiedAnswer] = createSignal<object>()
  const copied = () => copiedAnswer() === shown()

  const copy = () => {
    const value = answer()

    if (!value) return
    void system.copy(value).then(
      () => setCopiedAnswer(shown()),
      () => showToast({ title: ctx.t("common.requestFailed") }),
    )
  }

  return (
    <div class="flex h-full min-h-0 flex-col bg-v2-background-bg-base" data-slot="session-btw-panel">
      <div class="flex shrink-0 items-start justify-between gap-3 border-b border-v2-border-border-base px-5 py-4">
        <div class="min-w-0 text-13-regular text-text-weak">{props.btw.question(props.session, props.id)}</div>
        <Show when={answer()}>
          <Tooltip value={copied() ? ctx.t("common.copied") : ctx.t("copy")}>
            <IconButton
              size="small"
              variant="ghost-muted"
              icon={<Icon name={copied() ? "check" : "outline-copy"} />}
              aria-label={copied() ? ctx.t("common.copied") : ctx.t("copy")}
              onClick={copy}
            />
          </Tooltip>
        </Show>
      </div>

      <div class="relative min-h-0 flex-1">
        <Switch>
          <Match when={props.btw.pending(props.id)}>
            <div
              data-component="session-working"
              role="status"
              class="flex h-9 items-center px-5 pt-3 text-[13px] font-[530] leading-text-compact"
            >
              <TextShimmer text={ctx.t("session.timeline.working")} active />
            </div>
          </Match>
          <Match when={props.btw.error(props.session, props.id)}>
            <div class="flex h-full flex-col items-center justify-center gap-3 px-8 pb-24 text-center">
              <div class="text-13-regular text-text-weak">{ctx.t("error")}</div>
              <Button size="small" variant="outline" onClick={() => props.btw.retry(props.session, props.id)}>
                {ctx.t("retry")}
              </Button>
            </div>
          </Match>
          <Match when={answer()}>
            {(text) => (
              <ScrollView class="absolute inset-0">
                <div class="px-5 py-4 pb-8">
                  <Markdown text={text()} class="text-14-regular" />
                </div>
              </ScrollView>
            )}
          </Match>
        </Switch>
      </div>
    </div>
  )
}
