import { Schema } from "effect"

/** Body of `GET /health` on the API. Shared by api (encode), web (decode) and agent (log). */
export const HealthResponse = Schema.Struct({
  status: Schema.Literal("ok"),
})
export type HealthResponse = typeof HealthResponse.Type

export const decodeHealthResponse = Schema.decodeUnknownEffect(HealthResponse)
