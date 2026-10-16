import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Config, Effect, Layer } from "effect"
import { HttpRouter } from "effect/http"
import { createServer } from "node:http"
import { Routes } from "./routes.ts"

const ServerLive = Layer.unwrap(
  Effect.gen(function* () {
    const port = yield* Config.Port("API_PORT").pipe(Config.withDefault(3001))
    return HttpRouter.serve(Routes).pipe(Layer.provide(NodeHttpServer.layer(createServer, { port })))
  }),
)

Layer.launch(ServerLive).pipe(NodeRuntime.runMain)
