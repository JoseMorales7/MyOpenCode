export * as SessionGenerate from "./generate.js"

import type { FileSystem } from "../filesystem.js"
import { LLMClient, Message, SystemPart, type AIError } from "@opencode/ai"
import { Agent } from "@opencode/schema/agent"
import type { SideChat } from "@opencode/schema/side-chat"
import { Effect } from "effect"
import { Database } from "../database/database.js"
import { Instance } from "../instance/service.js"
import { Plugin } from "../plugin/service.js"
import type { Instructions } from "../instructions/index.js"
import { SessionContext } from "./context.js"
import type { AgentNotFoundError } from "./error.js"
import { SessionHistory } from "./history.js"
import { SessionProviderContext } from "./provider-context.js"
import { SessionModelRequest } from "./model-request.js"
import type { SessionRunnerModel } from "./runner/model.js"
import type { SessionSchema } from "./schema.js"
import type { MessageDecodeError } from "./error.js"
import { SideChatRequest } from "../side-chat.js"
import { toLLMMessages } from "./runner/to-llm-message.js"

export type Error =
  | AgentNotFoundError
  | Instructions.InitializationBlocked
  | SessionRunnerModel.Error
  | AIError
  | FileSystem.DirectoryNotFoundError
  | SessionHistory.BoundaryError
  | MessageDecodeError

/** Generates text from current Session context without mutating the Session. */
export const generate = Effect.fn("SessionGenerate.generate")(function* (input: {
  session: SessionSchema.Info
  prompt: string
  sideChat?: SideChat.SessionInput
}) {
  const instances = yield* Instance.Service
  const database = yield* Database.Service
  const llm = yield* LLMClient.Service

  return yield* Effect.gen(function* () {
    yield* Plugin.awaitActivation
    const context = yield* SessionContext.Service
    if (input.sideChat) {
      const model = yield* context.resolveModel({
        ...input.session,
        model: input.sideChat.model ?? input.session.model,
      })
      const history = yield* SessionHistory.previewThrough(
        database.db,
        input.session.id,
        input.sideChat.through,
        SessionProviderContext.provenance(model) ?? "local",
      )
      const prepared = yield* context.request.generate({
        session: input.session,
        agent: input.session.agent ?? Agent.ID.make("build"),
        model,
        // No tool snapshot: preparation also drops tool definitions invented by hooks.
        system: [SystemPart.make(SideChatRequest.instructions)],
        messages: [
          Message.user("Begin inherited parent history. Everything until the end marker is reference-only."),
          ...toLLMMessages(history, model.ref, model.model.route.providerMetadataKey ?? model.model.provider).map(
            (message) => (message.role === "system" ? Message.make({ ...message, role: "user" }) : message),
          ),
          Message.user("End inherited parent history. Only the following side-conversation requests are active."),
          ...SideChatRequest.messages(input.sideChat),
          Message.user(input.prompt),
        ],
      })
      return (yield* llm.generate(prepared.request, prepared.options)).text
    }
    const selection = yield* context.select(input.session.id)
    const model = yield* context.resolveModel(selection.session)
    const history = yield* SessionHistory.preview(
      database.db,
      selection.session.id,
      selection.instructions,
      SessionProviderContext.provenance(model) ?? "local",
    )
    const transcript = SessionModelRequest.baseTranscript({
      agent: selection.agent.info,
      model,
      tools: selection.tools,
      initial: history.initial,
      messages: history.messages,
    })
    const prepared = yield* context.request.generate({
      session: selection.session,
      agent: selection.agent.id,
      model,
      tools: selection.tools,
      system: transcript.system,
      messages: [
        ...transcript.messages,
        ...(history.instructionUpdate ? [Message.system(history.instructionUpdate)] : []),
        Message.user(input.prompt),
      ],
    })
    yield* Effect.logInfo("sending session generation request", {
      sessionID: selection.session.id,
      providerID: model.ref.providerID,
      modelID: model.ref.id,
    })
    const response = yield* llm.generate(prepared.request, prepared.options)
    yield* Effect.logInfo("session generation usage diagnostic", { usage: response.usage })
    return response.text
  }).pipe(instances.provide(input.session))
})
