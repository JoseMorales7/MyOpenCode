import { batch, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { showToast } from "@opencode/ui/toast"
import type { MountedSession, ResponseSelection, SetupContext } from "../sdk"
import { SessionMessage } from "@opencode/schema/session-message"
import { Model } from "@opencode/schema/model"
import { Provider } from "@opencode/schema/provider"
import type Btw from "./index"

const instructions = [
  "The user is asking a quick side question about the conversation so far.",
  "Answer directly and concisely in markdown from what you already know.",
  "Do not call any tools and do not take any actions.",
].join(" ")

/** Legacy one-shot answers and independent side threads, stored until their tabs close. */
export function createBtw(ctx: SetupContext<typeof Btw>) {
  const controllers = new Map<string, AbortController>()

  const [requests, setRequests] = createStore<{ pending: string[]; focus?: { id: string; token: object } }>({
    pending: [],
  })

  const saved = (session: MountedSession) => ctx.stores.chats(session)

  const stop = (id: string) => {
    controllers.get(id)?.abort()
    controllers.delete(id)
    setRequests("pending", (list) => list.filter((item) => item !== id))
  }

  // In-flight questions keep running when the user leaves their session and answer into its store; only a reload,
  // closing the question's tab or disposing the extension abandons one, which leaves it retryable.
  onCleanup(() => Array.from(controllers.keys()).forEach(stop))

  const entry = (session: MountedSession, id: string) => saved(session).value?.chats.find((item) => item.id === id)
  const pending = (id: string) => requests.pending.includes(id)

  // Takes the question rather than reading it back, because a new chat's write may still wait for the store to load.
  const generate = (session: MountedSession, id: string, question: string) => {
    if (pending(id)) return

    const store = saved(session)
    const controller = new AbortController()
    controllers.set(id, controller)
    setRequests("pending", (list) => [...list, id])

    return (
      session.server.client.session
        .generate(
          { sessionID: session.id, prompt: [instructions, question].join("\n\n") },
          { signal: controller.signal },
        )
        .then((result) => {
          if (ctx.signal.aborted || controller.signal.aborted) return
          store.update((draft) => {
            const chat = draft.chats.find((item) => item.id === id)

            if (chat) chat.answer = result.text.trim()
          })
        })
        // A missing answer is the retry state; no transient error flag is stored.
        .catch(() => undefined)
        .finally(() => {
          if (controllers.get(id) === controller) stop(id)
        })
    )
  }

  const ask = (value?: string) => {
    const question = value?.trim()

    if (!question) {
      showToast({ title: ctx.t("question.required") })

      return
    }

    const session = ctx.sessions.current()

    if (!session?.id) return

    const id = crypto.randomUUID()

    // Desktop storage loads asynchronously. A write before load queues and lands in the same batch that marks the
    // store ready, and the panel keeps a tab hidden until then, so the chat and its tab need not wait. The session's
    // store lives while its tab stays open, so leaving the session first still records the chat.
    batch(() => {
      saved(session).update((draft) => {
        draft.chats.push({ id, question })
      })
      ctx.layout.open(`${ctx.id}:${id}`, session, { tab: "select" })
    })
    void generate(session, id, question)
  }

  const focus = (session: MountedSession, id: string) => {
    ctx.layout.open(`${ctx.id}:${id}`, session, ctx.layout.narrow() ? undefined : { tab: "select" })
    setRequests("focus", { id, token: {} })
  }

  const open = (selection?: ResponseSelection) => {
    const session = selection?.session ?? ctx.sessions.current()

    if (!session) return
    const store = saved(session)

    const reuse =
      selection &&
      store.value?.chats.findLast(
        (chat) =>
          chat.thread?.mode === "selection" &&
          chat.thread.quotes.length < 16 &&
          chat.thread.messages.length <= 200 &&
          !pending(chat.id),
      )

    if (reuse) {
      store.update((draft) => {
        const thread = draft.chats.find((chat) => chat.id === reuse.id)?.thread

        if (
          thread &&
          !thread.quotes.some(
            (quote) =>
              quote.text === selection.quote.text &&
              quote.source.messageID === selection.quote.source.messageID &&
              quote.source.partID === selection.quote.source.partID &&
              quote.source.startOffset === selection.quote.source.startOffset &&
              quote.source.endOffset === selection.quote.source.endOffset,
          )
        )
          thread.quotes.push(selection.quote)
      })
      focus(session, reuse.id)

      return
    }

    const id = crypto.randomUUID()

    const boundary = selection
      ? selection.completed
        ? selection.quote.source.messageID
        : undefined
      : session.server.data.session.message
          .list(session.id)
          .findLast(
            (message) =>
              message.type === "user" || (message.type === "assistant" && message.time.completed !== undefined),
          )?.id

    const model = session.server.data.session.get(session.id)?.model
    store.update((draft) => {
      draft.chats.push({
        id,
        question: "",
        thread: {
          mode: selection ? "selection" : "fresh",
          through: boundary ? SessionMessage.ID.make(boundary) : undefined,
          model: model
            ? {
                id: Model.ID.make(model.id),
                providerID: Provider.ID.make(model.providerID),
                variant: model.variant ? Model.VariantID.make(model.variant) : undefined,
              }
            : undefined,
          quotes: selection ? [selection.quote] : [],
          messages: [],
          draft: "",
          started: false,
        },
      })
    })
    focus(session, id)
  }

  const send = (session: MountedSession, id: string, retry = false) => {
    const thread = entry(session, id)?.thread

    if (!thread || pending(id)) return
    const question = retry ? thread.messages.at(-1)?.text : thread.draft.trim()

    if (!question || (retry && thread.messages.at(-1)?.role !== "user")) return

    if (thread.mode === "conversation" && !thread.through) return
    const history = retry ? thread.messages.slice(0, -1) : thread.messages.slice()

    if (history.length > 200) {
      showToast({ title: ctx.t("thread.limit") })

      return
    }

    const quotes =
      thread.mode === "fresh" ? [] : thread.quotes.map((quote) => ({ ...quote, source: { ...quote.source } }))

    const store = saved(session)
    const controller = new AbortController()
    controllers.set(id, controller)
    setRequests("pending", (items) => [...items, id])
    store.update((draft) => {
      const chat = draft.chats.find((chat) => chat.id === id)

      if (!chat?.thread) return

      if (!chat.question) chat.question = question
      chat.thread.started = true
      chat.thread.draft = ""

      if (!retry) chat.thread.messages.push({ role: "user", text: question })
    })
    const input = { messages: history, quotes }

    const response =
      thread.mode === "conversation" && thread.through
        ? session.server.client.session.generate(
            {
              sessionID: session.id,
              prompt: question,
              sideChat: { ...input, through: thread.through, model: thread.model },
            },
            { signal: controller.signal },
          )
        : session.server.client.generate.text(
            { prompt: question, model: thread.model, sideChat: input },
            { signal: controller.signal },
          )

    void response
      .then((result) => {
        if (ctx.signal.aborted || controller.signal.aborted || controllers.get(id) !== controller) return
        const text = result.text.trim()

        if (!text) return
        store.update((draft) => {
          draft.chats.find((chat) => chat.id === id)?.thread?.messages.push({ role: "assistant", text })
        })
      })
      .catch(() => undefined)
      .finally(() => {
        if (controllers.get(id) === controller) stop(id)
      })
  }

  return {
    ask,
    open,
    send,
    stop,
    select: focus,
    current: (session: MountedSession) => {
      const id = requests.focus?.id

      return (id && entry(session, id)?.id) || saved(session).value?.chats.at(-1)?.id
    },
    focus: (id: string) => (requests.focus?.id === id ? requests.focus.token : undefined),
    thread: (session: MountedSession, id: string) => entry(session, id)?.thread,
    edit: (
      session: MountedSession,
      id: string,
      value: { draft?: string; mode?: "conversation" | "selection" | "fresh" },
    ) => {
      saved(session).update((draft) => {
        const thread = draft.chats.find((chat) => chat.id === id)?.thread

        if (!thread) return

        if (value.draft !== undefined) thread.draft = value.draft

        if (value.mode && !thread.started) {
          if (value.mode === "conversation" && !thread.through) return
          thread.mode = value.mode

          if (value.mode === "fresh") thread.quotes = []
        }
      })
    },
    quote: (session: MountedSession, id: string, quoteID: string, comment?: string) => {
      saved(session).update((draft) => {
        const thread = draft.chats.find((chat) => chat.id === id)?.thread

        if (!thread || thread.started) return

        if (comment === undefined) {
          thread.quotes = thread.quotes.filter((quote) => quote.id !== quoteID)

          return
        }

        const quote = thread.quotes.find((quote) => quote.id === quoteID)

        if (quote) quote.comment = comment
      })
    },
    saved,
    pending,
    question: (session: MountedSession, id: string) => entry(session, id)?.question,
    answer: (session: MountedSession, id: string) => entry(session, id)?.answer,
    error: (session: MountedSession, id: string) => {
      const item = entry(session, id)

      return !!item && item.answer === undefined && !pending(id)
    },
    retry: (session: MountedSession, id: string) => {
      const question = entry(session, id)?.question

      if (question) void generate(session, id, question)
    },
    /** Closing a tab forgets its question and answer. */
    remove: (session: MountedSession, id: string) => {
      stop(id)
      saved(session).update((draft) => {
        draft.chats = draft.chats.filter((item) => item.id !== id)
      })
    },
  }
}

export type BtwModel = ReturnType<typeof createBtw>
