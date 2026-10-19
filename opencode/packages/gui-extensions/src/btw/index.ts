import { Schema } from "effect"
import { SideChat } from "@opencode/schema/side-chat"
import { SessionMessage } from "@opencode/schema/session-message"
import { Model } from "@opencode/schema/model"
import { Extension, Store } from "../sdk"
import en from "./i18n/en"

const Thread = Schema.Struct({
  mode: Schema.Literals(["conversation", "selection", "fresh"]),
  through: Schema.optional(SessionMessage.ID),
  model: Schema.optional(Model.Ref),
  quotes: Schema.Array(SideChat.Quote),
  messages: Schema.Array(SideChat.Message),
  draft: Schema.String,
  started: Schema.Boolean,
})

const Chats = Schema.Struct({
  chats: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      question: Schema.String,
      answer: Schema.optional(Schema.String),
      thread: Schema.optional(Thread),
    }),
  ),
})

export default Extension.define({
  id: "btw",
  stores: {
    // Each open /btw tab's chat (its question and answer), kept until its tab closes.
    chats: Store.session(Chats, { chats: [] }),
  },
  i18n: { en },
})
