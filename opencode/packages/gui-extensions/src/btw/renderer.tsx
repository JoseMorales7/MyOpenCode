import { createMemo, For, lazy, onCleanup, Show, Suspense } from "solid-js"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Button } from "@opencode/ui/button"
import { Command, createKeyed, onIdle, Panel, SelectionAction, Slot, usePanel, type PanelTab, type Setup } from "../sdk"
import type Btw from "./index"
import { createBtw } from "./model"

const setup: Setup<typeof Btw> = (ctx) => {
  const SessionBtwPanel = lazy(() => import("./panel"))
  const CloseSideChat = lazy(() => import("./close-dialog"))
  onCleanup(onIdle(() => void SessionBtwPanel.preload()))
  const layout = ctx.layout
  const sessions = ctx.sessions
  const btw = createBtw(ctx)
  // Changes when a session mounts or unmounts, not on every switch between sessions.
  const mounted = createMemo(() => !!sessions.current())

  // Tab objects per session, reused so strip updates and session switches do not rebuild a trigger.
  const tabs = new Map<string, Map<string, PanelTab>>()

  // Drops the tab objects of sessions whose shell tab closed.
  createKeyed(
    () => [...sessions.list().map((session) => session.key), sessions.current()?.key].join("\u0000"),
    () => {
      const keep = new Set([...sessions.list().map((session) => session.key), sessions.current()?.key])
      tabs.forEach((_cache, key) => {
        if (!keep.has(key)) tabs.delete(key)
      })
    },
  )

  ctx.add(
    Command,
    (): Command => ({
      id: "ask",
      title: ctx.t("command.title"),
      description: ctx.t("command.description"),
      group: ctx.t("command.category.session"),
      section: "session",
      slash: { name: "btw", arguments: true },
      hidden: true,
      // Offered only while a session is open in a desktop-width window.
      enabled: !layout.narrow() && mounted(),
      run: (input) => btw.ask(input),
    }),
  )

  ctx.add(Panel, {
    id: "main",
    region: "side",
    transient: true,
    mobile: { title: ctx.t("thread.title"), order: 35, kind: "menu", icon: "bubble-5" },
    // Layouts saved before extensions store the tab as "btw"; as a panel key it leaves like any unlisted transient tab.
    legacy: { btw: "main" },
    // One tab per stored question. Until the session's store loads, its tabs stay listed but hidden so restore keeps
    // them; afterwards a tab without a stored question leaves the strip.
    list: (input) => {
      if (input.open.length === 0) return []

      const saved = btw.saved(input.session)
      const cache = tabs.get(input.session.key) ?? new Map<string, PanelTab>()
      tabs.set(input.session.key, cache)

      return input.open.flatMap((id) => {
        if (saved.ready() && !saved.value?.chats.some((item) => item.id === id)) return []

        const existing = cache.get(id)

        if (existing) return [existing]

        const tab: PanelTab = {
          id,
          get title() {
            return saved.value?.chats.find((item) => item.id === id)?.question || ctx.t("thread.title")
          },
          get hidden() {
            return !saved.ready()
          },
          label: (state) => (
            <div class="flex min-w-0 items-center gap-1.5">
              <Icon name="bubble-5" size="small" />
              <span class="truncate">{btw.question(state.session, id) || ctx.t("thread.title")}</span>
            </div>
          ),
        }

        cache.set(id, tab)

        return [tab]
      })
    },
    render: (props) => {
      // A mobile panel has one fixed provider tab; do not retain its enclosing Match's tab getter.
      const mobile = usePanel().placement() === "mobile"
      const id = () => (mobile ? btw.current(props.session) : props.tab.id)

      return (
        <Suspense>
          <div class="flex h-full min-h-0 flex-col">
            <Show when={mobile && (btw.saved(props.session).value?.chats.length ?? 0) > 1}>
              <select
                aria-label={ctx.t("thread.choose")}
                class="shrink-0 border-b border-v2-border-border-base bg-v2-background-bg-base p-2 text-13-regular"
                value={btw.current(props.session)}
                onChange={(event) => btw.select(props.session, event.currentTarget.value)}
              >
                <For each={btw.saved(props.session).value?.chats}>
                  {(chat) => <option value={chat.id}>{chat.question || ctx.t("thread.title")}</option>}
                </For>
              </select>
            </Show>
            <Show
              when={id()}
              fallback={
                <div class="flex flex-col gap-3 p-4 text-13-regular">
                  <p>{ctx.t("thread.empty")}</p>
                  <Button onClick={() => btw.open()}>{ctx.t("thread.new")}</Button>
                </div>
              }
            >
              <div class="min-h-0 flex-1">
                <SessionBtwPanel btw={btw} session={props.session} id={id() ?? ""} />
              </div>
            </Show>
          </div>
        </Suspense>
      )
    },
    close: (input) => {
      const session = input.session
      const id = input.tab.id

      if (btw.thread(session, id)?.started) {
        ctx.dialogs.open((dialog) => (
          <Suspense>
            <CloseSideChat
              close={dialog.close}
              confirm={() => {
                btw.remove(session, id)
                tabs.get(session.key)?.delete(id)
              }}
              cancel={() => {
                if (!ctx.signal.aborted) btw.select(session, id)
              }}
            />
          </Suspense>
        ))

        return
      }

      btw.remove(input.session, input.tab.id)
      tabs.get(input.session.key)?.delete(input.tab.id)
    },
  })

  ctx.add(SelectionAction, {
    id: "ask-selection",
    get title() {
      return ctx.t("thread.askSelection")
    },
    run: (input) => btw.open(input),
  })
  ctx.add(
    Command,
    (): Command => ({
      id: "new",
      title: ctx.t("thread.new"),
      description: ctx.t("thread.description"),
      group: ctx.t("command.category.session"),
      section: "session",
      enabled: mounted(),
      run: () => btw.open(),
    }),
  )
  ctx.add(Slot, {
    at: "session.header",
    render: (input) => (
      <Show when={input.active}>
        <IconButton
          size="small"
          variant="ghost"
          aria-label={ctx.t("thread.new")}
          title={ctx.t("thread.new")}
          icon={<Icon name="bubble-5" />}
          onClick={() => btw.open()}
        />
      </Show>
    ),
  })
}

export default setup
