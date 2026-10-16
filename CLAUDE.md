# Parley

Realtime voice agent. A user calls it from the browser, speaks, and the agent answers out loud with low latency. The user can interrupt it mid-sentence. Portfolio project: the custom voice pipeline is the point of the project.

## The constraint (read this first)

**LiveKit is only the audio transport.** Use `@livekit/rtc-node` on the server and `livekit-client` in the browser to move audio frames. That is all LiveKit does here.

Do **not** use, install or copy from:

- `@livekit/agents` or any `@livekit/agents-plugin-*` package
- LiveKit's voice pipeline, `AgentSession`, turn detector model, VAD plugin or interruption handling
- `useVoiceAssistant` or other agent-aware hooks in `@livekit/components-react`
- Provider "agent" products that bundle the pipeline: Deepgram Voice Agent API (`client.agent.v1`), Cartesia agents

We write VAD gating, turn detection, interruption, cancellation and history truncation ourselves. If a task seems to need one of the packages above, stop and ask.

Provider signals such as Deepgram `speech_final` or `UtteranceEnd` may be **inputs** to our turn detector. The decision itself lives in our code. Deepgram Flux (`listen.v2`) does end-of-turn detection server-side, so it may only appear as a comparison baseline in benchmarks and never as the main path.

## Goals (measured and published)

| #   | Metric           | Target               | Measured from → to                                                                                                                                          |
| --- | ---------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | Response latency | p50 < 800 ms         | end of user speech → first agent audio frame captured into `AudioSource` (also report the client-side number from the browser)                              |
| G2  | Barge-in         | audio stops < 150 ms | user speech onset detected by the agent → agent playout cleared (`AudioSource.clearQueue()` returned, TTS context cancelled)                                |
| G3  | Honest history   | 100%                 | after an interruption, the assistant turn in history contains only the words whose audio actually played, based on TTS word timestamps and playout position |

Every phase that touches the hot path must not regress G1 and G2. Once tracing exists (Phase 4), report the numbers in the PR or commit message.

## Architecture

```
Browser (apps/web)                    LiveKit server (SFU)               apps/agent (Node worker)
───────────────────                   ────────────────────               ───────────────────────
mic ── livekit-client ── publish ───▶ room ──▶ @livekit/rtc-node AudioStream (16 kHz mono)
                                                                            │
                                                                     Stream<AudioFrame>
                                                                            │
                                                       ┌── VAD / turn detector ──┐
                                                       │                         │
                                                  STT service (Deepgram ws)   barge-in signal
                                                       │                         │
                                                  transcript events     interrupts the Turn fiber
                                                       │
                                                  Turn fiber (scoped):
                                                    LLM service (stream tokens)
                                                      → sentence chunker
                                                      → TTS service (Cartesia ws context, word timestamps)
                                                      → AudioSource.captureFrame
speaker ◀── livekit-client ◀── subscribe ◀── room ◀── LocalAudioTrack
                                                       │
                                                  PlayoutTracker: played ms → heard words → history

apps/api (HTTP): issues LiveKit tokens, creates sessions, stores conversations and latency traces in Postgres
packages/shared: Effect Schema types used by all three apps
```

### Agent pipeline model

- **One Effect `Scope` per call.** Room connection, provider sockets and fibers are acquired in it. Hanging up closes the scope and everything is released.
- **Audio is `Stream`.** Inbound frames come from `AudioStream` (a WHATWG `ReadableStream<AudioFrame>`), wrapped with `Stream.fromReadableStream`. Outbound audio is a `Stream` drained into `AudioSource.captureFrame`.
- **Each agent reply is a "Turn" fiber** (LLM → chunker → TTS → playout), forked into the call scope. Barge-in **interrupts that fiber**, and its finalizers do the cleanup: cancel the Cartesia context, `clearQueue()` the `AudioSource`, abort the LLM stream, then commit only the heard text. Cleanup lives in finalizers (`Effect.ensuring`, `Effect.onInterrupt`, `acquireRelease`), never in ad-hoc callbacks.
- **Heard words = playout position ∩ word timestamps.** Track ms of audio captured per Turn minus `AudioSource.queuedDuration`, which is milliseconds still buffered. Map that onto Cartesia `word_timestamps` (`{ words[], start[], end[] }` in seconds). Account for client-side jitter buffer delay, and record the offset used in DECISIONS.md.
- **Providers sit behind Effect services** (`Context.Service` + `Layer`), so a provider can be swapped by swapping a Layer. Domain code never imports a provider SDK.

| Service           | Default Layer                                                                   | Notes                                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Stt`             | Deepgram `listen.v1` websocket (`nova-3`, `linear16` @ 16 kHz, interim results) | `client.listen.v1.connect(...)`, `sendMedia`, `sendFinalize`, `sendKeepAlive`. The socket is also an async iterable.                                                    |
| `Llm`             | Groq `groq-sdk`, streaming chat completions (D-003)                             | Model is config. Choosing it is a TTFT vs quality trade-off; log it in DECISIONS.md. Check the installed `groq-sdk` `.d.ts` for the streaming API before Phase 3.       |
| `Tts`             | Cartesia websocket: `client.tts.websocket()` → `ws.context({...})`              | `push({ transcript })`, `no_more_inputs()`, `receive()`, `cancel()`. Request `add_timestamps: true`, output `pcm_s16le`.                                                |
| `Transport`       | `@livekit/rtc-node` `Room`                                                      | `AudioStream(track, { sampleRate, numChannels, frameSizeMs })`, `AudioSource(sampleRate, numChannels, queueSize)`, `clearQueue()`, `waitForPlayout()`, `queuedDuration` |
| `Clock` / tracing | Effect spans                                                                    | Every hop in G1 is a span; see Phase 4                                                                                                                                  |

Every service also has a **fake Layer** for tests (scripted transcripts, canned token streams, synthetic PCM). Tests never hit the network.

## Stack and versions (checked 2026-10-17)

| Area                | Package                                                                             | Version                                        |
| ------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------- |
| Runtime             | Node                                                                                | 24.x                                           |
| Package manager     | pnpm (workspaces, `catalog:` pins)                                                  | 12.14.0 (via corepack, `packageManager` field) |
| Language            | `typescript`                                                                        | 6.0.3 pinned, not 7.x (D-002)                  |
| Core                | `effect`                                                                            | 4.0.x (LTS)                                    |
| Node platform       | `@effect/platform-node`                                                             | 4.0.x                                          |
| Postgres            | `@effect/sql-pg`                                                                    | 4.0.x                                          |
| Tests               | `vitest` 5.x + `@effect/vitest`                                                     | 4.0.x                                          |
| Transport (server)  | `@livekit/rtc-node`                                                                 | 1.1.x                                          |
| Tokens              | `livekit-server-sdk`                                                                | 2.19.x (in `apps/api` only)                    |
| Transport (browser) | `livekit-client`                                                                    | 2.23.x                                         |
| STT                 | `@deepgram/sdk`                                                                     | 5.15.x                                         |
| TTS                 | `@cartesia/cartesia-js`                                                             | 4.2.x                                          |
| LLM                 | `groq-sdk`                                                                          | 1.6.x (D-003)                                  |
| Web                 | `react` 19, `vite` 8, `@tanstack/react-router` 1.170.x, `@tanstack/react-query` 5.x | exact pins in `pnpm-workspace.yaml`            |

**Effect 4 traps. Read these before writing Effect code:**

- `@effect/platform`, `@effect/rpc` and `@effect/cluster` were **merged into `effect`**. Do not install `@effect/platform`: npm still serves its 0.x line, which targets Effect 3. Import HTTP from `effect/http` (`HttpRouter`, `HttpServer`, `HttpServerResponse`, …) and SQL from `effect/sql`. Only the runtime adapters stay separate (`@effect/platform-node`, `@effect/sql-pg`).
- Modules under `effect/http`, `effect/sql`, `effect/schema` and similar are tagged `@stability unstable`: they can break in minor releases. **Pin exact versions** of `effect` and all `@effect/*` packages, and keep them on the same version.
- Services are `Context.Service` (formerly `Context.Tag`). `FiberRef` became `Context.Reference`. `Either` became `Result`. `catchAll` is gone; use `catchTag` / `catchTags` / `catchCause` / `catchIf`. Fork with `forkChild` / `forkScoped` / `forkDetach`. If memory and the installed `.d.ts` disagree, the `.d.ts` wins.
- Config constructors are **capitalized**: `Config.String`, `Config.NonEmptyString`, `Config.Redacted`, `Config.URL`, `Config.Port`. A `Config` is itself an `Effect` (no `asEffect()`); use `Config.option` to tell "missing" apart from "invalid".
- The `effect` package ships runnable examples in `node_modules/effect/ai-docs/src/` (HTTP server, testing, Schema, layers). Read them before guessing.

Docs: the v4 migration guide at https://github.com/Effect-TS/effect/blob/main/MIGRATION.md and the API reference at https://effect.website/docs/v4/api/effect.

## Repo layout (target)

```
apps/
  web/     React + Vite + TanStack Router + TanStack Query. Joins the room, shows call state and live latency
  api/     Effect HTTP server (effect/http on @effect/platform-node) + Postgres (@effect/sql-pg)
  agent/   Effect worker: joins rooms as a participant, runs the pipeline
packages/
  shared/  Effect Schema: API contracts, DB row shapes, pipeline events, trace records
docs/
  ROADMAP.md     phases and their exit criteria
  DECISIONS.md   decision log (append-only)
```

## Conventions

**TypeScript**

- `strict: true`, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and `verbatimModuleSyntax` (see `tsconfig.base.json`). ESM only.
- Node runs `.ts` directly (native type stripping, no build step, no tsx). So: `erasableSyntaxOnly` (no `enum`, no parameter properties, no `namespace`), and relative imports carry the `.ts` extension. Workspace packages export `src/index.ts`.
- **No `any`**: no explicit `any`, no `as any`, no `@ts-ignore`. If a type is genuinely unknown, use `unknown` and decode it with Schema. `@ts-expect-error` is allowed only with a comment linking an upstream issue.
- No non-null assertions (`!`) in `apps/agent` hot-path code.

**Errors**

- Errors are **typed Effect errors**: `Schema.TaggedError` classes (or `Data.TaggedError` for errors that never cross a boundary), one per failure mode, e.g. `SttConnectionError` or `TtsContextCancelled`. Never throw or reject in domain code.
- Every Promise or callback from an SDK is wrapped at the service boundary (`Effect.tryPromise({ try, catch })`, `Effect.callback`, `Stream.fromAsyncIterable(iter, onError)`) and mapped to a tagged error there.
- Interruption is not an error. Barge-in is a normal interrupt and must not show up as a failure in logs or traces.
- Unrecoverable bugs are defects (`Effect.die`). Don't model them as expected errors.

**Effect style**

- Services: `class X extends Context.Service<X, {...}>()("parley/X") {}` + `Layer`. One file per service. The live Layer and the test Layer sit side by side.
- Use `Effect.fn("name")` for traced functions on the pipeline path. Span names are stable: they are the benchmark keys.
- Config comes through `Config` (`Config.Redacted` for keys). Nothing reads `process.env` directly (build tooling like `vite.config.ts` excepted). A process fails fast at startup with one message naming every missing variable (see `apps/agent/src/config.ts`).
- Resources go through `Effect.acquireRelease` or `Layer.scoped`. No manual `close()` calls outside a finalizer.

**Shared types**

- Anything crossing a process or network boundary (HTTP bodies, DB rows, data-channel messages, trace records) is defined once as an Effect Schema in `packages/shared` and decoded at the edge.

**Tests**

- `@effect/vitest` (`it.effect`, `it.scoped`, `TestClock`) with fake provider Layers.
- Timing logic (turn detector, barge-in, heard-word truncation) is tested with `TestClock` and synthetic frames, not wall time.

**Definition of done for every phase**

1. `pnpm typecheck` passes (zero errors, across the whole workspace).
2. `pnpm test` passes.
3. `pnpm lint` passes.
4. The ROADMAP exit criteria for the phase are met and the phase is ticked off.
5. Any non-obvious choice is recorded in `docs/DECISIONS.md`.

Do not start the next phase with a red typecheck or red tests.

**Secrets**

- Keys live in `.env` files that are git-ignored; `.env.example` lists the variable names. Never commit, log or echo keys. Effect `Redacted` keeps them out of logs.
- Variables (see `.env.example`): `API_PORT`, `DATABASE_URL`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `DEEPGRAM_API_KEY`, `CARTESIA_API_KEY`, `GROQ_API_KEY`. A variable becomes _required_ in the phase that first uses it.
- Every app loads the repo-root `.env` via `node --env-file-if-exists=../../.env`.

**Dependencies**

- Versions are pinned exactly in the `catalog:` of `pnpm-workspace.yaml`; packages reference `catalog:`.
- pnpm 12 enforces a minimum release age. Don't bypass it with `minimumReleaseAgeExclude`; pin the previous release instead.
- Banned packages are enforced twice: `no-restricted-imports` in ESLint and `scripts/check-banned-deps.ts` for manifests. The list lives in `scripts/banned.ts`.

## Running things

```sh
corepack enable                 # provides pnpm 12 (if it can't write /usr/local/bin:
                                #   corepack enable --install-directory ~/.local/bin)
pnpm install

docker compose up -d            # livekit-server --dev (ws://localhost:7880, devkey/secret) + postgres:18
pnpm --filter @parley/api db:migrate    # Phase 8: @effect/sql-pg migrator

pnpm dev                        # api (:3001) + agent + web (:5173) via concurrently
pnpm --filter @parley/web dev   # http://localhost:5173, proxies /api/* → API
pnpm --filter @parley/api dev   # node --watch
pnpm --filter @parley/agent dev # no watch for agent (rtc-node + hot reload breaks WebRTC)

pnpm typecheck                  # tsc --noEmit for root scripts + every package
pnpm test                       # vitest run in every package
pnpm lint                       # eslint + prettier --check + banned-deps check
pnpm format                     # prettier --write
pnpm bench                      # Phase 9: latency + barge-in benchmark harness
```

CI (`.github/workflows/ci.yml`) runs install → typecheck → lint → test on every push and PR.

## Working rules for Claude

- Check installed `.d.ts` files (or `npm view`) before using any SDK API. These libraries move fast; memory is not a source.
- Keep changes inside the current phase. If something belongs in a later phase, note it in ROADMAP.md instead of building it.
- Hot-path code (`apps/agent/src/pipeline/**`) changes come with a test and, after Phase 4, a before/after latency number.
