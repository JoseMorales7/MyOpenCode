import { Model } from "@opencode/schema/model"
import { SideChat } from "@opencode/schema/side-chat"
import { optional } from "@opencode/schema/schema"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { LocationNotFoundError, InvalidRequestError, ServiceUnavailableError } from "../errors.js"

export const GenerateGroup = HttpApiGroup.make("server.generate")
  .add(
    HttpApiEndpoint.post("generate.text", "/api/experimental/generate", {
      payload: Schema.Struct({
        prompt: Schema.String,
        model: Model.Ref.pipe(Schema.optional),
        sideChat: optional(SideChat.Input),
      }),
      success: Schema.Struct({
        data: Schema.Struct({ text: Schema.String }),
      }).annotate({ identifier: "GenerateTextResponse" }),
      error: [InvalidRequestError, ServiceUnavailableError, LocationNotFoundError],
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "experimental.generate.text",
        summary: "Generate text",
        description:
          "Run one stateless model generation using the server's base configuration and return the assistant text. Uses the base configuration's default model when none is specified.",
      }),
    ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "generate",
      description: "Experimental one-shot generation routes.",
    }),
  )
