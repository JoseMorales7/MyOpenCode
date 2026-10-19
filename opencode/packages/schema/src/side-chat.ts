export * as SideChat from "./side-chat.js"

import { Schema } from "effect"
import { Model } from "./model.js"
import { SessionID } from "./session-id.js"
import { SessionMessage } from "./session-message.js"
import { NonNegativeInt, optional } from "./schema.js"

const Text = Schema.String.check(Schema.isMaxLength(131_072))

/** A captured passage, independent of the question the user types about it. */
export interface Quote extends Schema.Schema.Type<typeof Quote> {}
export const Quote = Schema.Struct({
  id: Schema.NonEmptyString,
  text: Text,
  source: Schema.Struct({
    sessionID: SessionID,
    messageID: SessionMessage.ID,
    partID: Schema.String,
    serverID: optional(Schema.String),
    startOffset: optional(NonNegativeInt),
    endOffset: optional(NonNegativeInt),
  }),
  comment: optional(Text),
}).annotate({ identifier: "SideChat.Quote" })

/** Previous side-thread messages only; the current question is the request's prompt. */
export interface Message extends Schema.Schema.Type<typeof Message> {}
export const Message = Schema.Struct({
  role: Schema.Literals(["user", "assistant"]),
  text: Text,
}).annotate({ identifier: "SideChat.Message" })

/** Opts a generation into isolated, tool-free side dialogue without creating a Session. */
export interface Input extends Schema.Schema.Type<typeof Input> {}
export const Input = Schema.Struct({
  messages: Schema.Array(Message).check(Schema.isMaxLength(200)),
  quotes: Schema.Array(Quote).check(Schema.isMaxLength(16)),
}).annotate({ identifier: "SideChat.Input" })

/** A fixed, inclusive message boundary; later parent history is never admitted. */
export interface SessionInput extends Schema.Schema.Type<typeof SessionInput> {}
export const SessionInput = Schema.Struct({
  ...Input.fields,
  through: SessionMessage.ID,
  model: optional(Model.Ref),
}).annotate({ identifier: "SideChat.SessionInput" })
