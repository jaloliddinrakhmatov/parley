# Roadmap

Each phase ends with `pnpm typecheck`, `pnpm test` and `pnpm lint` green, plus that phase's exit criteria met. Tick boxes as they are done. Things discovered mid-phase that belong later go into the "Parking lot" at the bottom, not into the current diff.

Goals referenced below (defined in [CLAUDE.md](../CLAUDE.md)):
**G1** p50 < 800 ms, end of user speech → first agent audio frame.
**G2** agent audio stops < 150 ms after the user starts talking.
**G3** history after an interruption contains only the words the user heard.

---

## Phase 0: Scaffold

Goal: an empty monorepo that typechecks, tests and runs, with Effect wired correctly.

- [x] pnpm workspace: `apps/web`, `apps/api`, `apps/agent`, `packages/shared`; root `tsconfig.base.json` (strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`); per-package `tsc --noEmit` instead of project references (Node runs `.ts` directly, nothing is emitted)
- [x] Exact-pinned `effect` and `@effect/*` on the same 4.0.x version via the pnpm `catalog:`; **no `@effect/platform`** (D-001)
- [x] ESLint config that bans `any`, `@ts-ignore`, and imports of `@livekit/agents*` / `@effect/platform`; manifest check in `scripts/check-banned-deps.ts`; Prettier
- [x] `docker-compose.yml`: `livekit/livekit-server --dev`, `postgres` (written; not yet run, since Docker isn't installed on the dev machine)
- [x] `.env.example`, `.gitignore` (includes `.env*`, except `.env.example`)
- [x] `packages/shared`: one sample Schema (`HealthResponse`) + test, imported by all three apps
- [x] `apps/api`: `GET /health` via `effect/http` on `@effect/platform-node`
- [x] `apps/agent`: an Effect program that loads config (`Config.Redacted` for secrets), fails fast naming every missing variable, logs `agent ready` and exits cleanly on SIGINT
- [x] `apps/web`: Vite + TanStack Router with one route and a TanStack Query call to `/health`
- [x] Root scripts: `dev`, `typecheck`, `test`, `lint` (+ `format`)
- [x] GitHub Actions: install → typecheck → lint → test on push and PR
- [x] TypeScript version decided (D-002)

**Exit:** `pnpm install && pnpm typecheck && pnpm test && pnpm lint` all pass from a clean clone; `pnpm dev` shows the web page with the API health status.

## Phase 1: LiveKit loopback

Goal: prove the transport. The agent joins a room and echoes the user's audio back.

- [ ] `apps/api`: `POST /sessions` returns `{ roomName, token, livekitUrl }` (token minted with `livekit-server-sdk`); request and response Schemas in `shared`
- [ ] `Transport` service in `apps/agent`: scoped `Room.connect`, subscribe to the first remote audio track, `AudioStream` → `Stream<AudioFrame>`, publish `LocalAudioTrack` from an `AudioSource`
- [ ] Echo pipeline: inbound frames → outbound `captureFrame` (optionally delayed 500 ms so the echo is audible)
- [ ] Agent dispatch: the API tells the agent to join the room (simple HTTP or queue; record the choice in DECISIONS.md)
- [ ] `apps/web`: "Call" button → join room with `livekit-client`, publish mic, play remote track, "Hang up"
- [ ] Scope test: hanging up closes the room, the `AudioSource` and the streams; no leaked handles (fake transport in unit tests, plus one manual check)

**Exit:** speak in the browser, hear yourself back from the agent. Hang up and the agent's call scope is fully released (logged).

## Phase 2: Audio in + STT

Goal: live transcripts of the user's speech.

- [ ] `Stt` service interface: `Stream<AudioFrame> → Stream<TranscriptEvent>` (interim, final, speech-started, utterance-end) defined in `shared`
- [ ] Deepgram Layer: `listen.v1` websocket, `nova-3`, `linear16` 16 kHz mono, interim results; KeepAlive while silent; reconnect policy; typed errors
- [ ] Frame format: `AudioStream` at 16 kHz mono, 20 ms frames → `Int16Array` → `sendMedia` (no copies through `slice`; use `subarray`)
- [ ] Fake STT Layer for tests (scripted events with timings)
- [ ] Temporary end-of-turn rule: final transcript + fixed silence timeout (to be replaced in Phase 6)
- [ ] Transcripts sent to the browser over the LiveKit data channel (Schema-encoded) and shown live

**Exit:** speaking shows interim → final text in the UI. Unit tests cover event mapping and error mapping.

## Phase 3: LLM + TTS out

Goal: the agent answers out loud. The full loop works, with no interruption yet.

- [ ] `Llm` service: `history → Stream<TextDelta>`; Groq Layer (`groq-sdk`, streaming chat completions, D-003); model from Config
- [ ] Sentence/phrase chunker: emit at punctuation or after N chars so TTS starts early (unit tested, including abbreviations and numbers)
- [ ] `Tts` service: `Stream<string> → Stream<AudioChunk | WordTimestamps>`; Cartesia Layer with `tts.websocket()` → one `context` per Turn, `push` per chunk, `no_more_inputs` at end, `add_timestamps: true`, `pcm_s16le`
- [ ] Playout: PCM → `AudioFrame` → `AudioSource.captureFrame`, with an explicit small `queueSize`
- [ ] `Turn` as a scoped fiber: LLM → chunker → TTS → playout, with finalizers already in place (even though nothing interrupts it yet)
- [ ] Conversation history held in memory per call
- [ ] Fake LLM and TTS Layers; an end-to-end pipeline test with all fakes

**Exit:** a multi-turn spoken conversation works in the browser. The fake-layer E2E test asserts the event order: transcript → LLM → TTS → frames.

## Phase 4: Latency tracing

Goal: measure G1 (and prepare to measure G2) before optimising anything.

- [ ] Stable span names for every hop: `vad.speech_end`, `stt.final`, `turn.commit`, `llm.first_token`, `tts.first_audio`, `playout.first_frame` (plus `bargein.*` placeholders)
- [ ] Per-turn trace record (Schema in `shared`) with all timestamps on one monotonic clock
- [ ] Export: decide between OpenTelemetry (`@effect/opentelemetry` → local Jaeger/Tempo) and a custom sink, and record the choice in DECISIONS.md
- [ ] Browser-side measurement: time from the user's speech end (client VAD or mic energy) to the first remote audio sample played, sent back over the data channel
- [ ] Live latency readout in the UI (per turn + rolling p50/p95)
- [ ] First baseline numbers written into DECISIONS.md

**Exit:** every turn produces a complete trace, and the baseline p50/p95 for G1 is recorded, with a breakdown of where the time goes.

## Phase 5: Barge-in

Goal: G2 and G3. The user can talk over the agent and history stays honest.

- [ ] Speech onset detector on inbound frames while the agent is speaking (energy/VAD; must ignore the agent's own echo; record the approach in DECISIONS.md)
- [ ] On onset: interrupt the Turn fiber. Its finalizers cancel the Cartesia context, `clearQueue()` the `AudioSource`, abort the LLM stream and stop the chunker
- [ ] `PlayoutTracker`: ms captured − `queuedDuration` → played ms → map onto word timestamps → heard prefix; commit only that to history (mark the turn as interrupted)
- [ ] False-positive handling: a short noise that isn't speech should not kill the turn (threshold + minimum duration; tuned in Phase 6)
- [ ] Spans: `bargein.onset` → `bargein.audio_stopped`
- [ ] Tests with `TestClock`: interrupt at word k → history holds exactly words 0..k−1 (and handles a cut in the middle of a word, with the rule chosen and documented); interrupt before first audio → empty assistant turn; interrupt after full playout → full text

**Exit:** manual test: interrupting mid-sentence stops audio within the target, and the next LLM request only contains heard words. Measured G2 recorded (p50/p95).

## Phase 6: Turn detection

Goal: replace the Phase 2 temporary rule with our own turn detector. Improve G1 without cutting users off.

- [ ] `TurnDetector` service: inputs are VAD state, STT interim/final events, silence duration, and optional text cues (trailing conjunctions, question marks); output is `EndOfTurn` / `StillSpeaking` with a confidence score
- [ ] Adaptive silence threshold (shorter after complete sentences, longer after fillers or mid-clause)
- [ ] Speculative start: optionally begin the LLM call early on a likely end of turn and discard it if the user keeps talking (cost and benefit measured, decision recorded)
- [ ] Dataset of recorded test utterances (with consent) + expected turn boundaries; offline evaluation script
- [ ] Metrics: premature-cut rate, mean end-of-turn delay

**Exit:** the turn detector beats the Phase 2 rule on the dataset (lower delay at a premature-cut rate that is equal or lower). G1 is re-measured and recorded.

## Phase 7: Frontend polish

Goal: a product someone would show.

- [ ] Call screen: connection state, mic level, agent speaking/listening/thinking states, live captions with the "heard" vs "unsaid" split after a barge-in
- [ ] Latency panel (per-turn breakdown from Phase 4 traces)
- [ ] Device picker, mute, permission and error states (no mic, network drop, provider down) driven by typed errors
- [ ] Routes: home, call, history (Phase 8), and a run-detail view for benchmarks
- [ ] Accessibility pass (keyboard, focus, captions), mobile layout

**Exit:** a stranger can open the app, make a call and understand what is happening without explanation.

## Phase 8: Persistence

Goal: conversations and traces survive restarts.

- [ ] Postgres schema via `@effect/sql-pg` migrations: `sessions`, `turns` (role, text, interrupted, heard_text), `turn_traces`
- [ ] Repositories as Effect services; row Schemas in `shared`
- [ ] Agent writes turns and traces asynchronously, off the hot path (bounded queue; never block audio)
- [ ] API: list sessions, get a session with its turns and traces
- [ ] Web: history view backed by TanStack Query
- [ ] Repository tests against a real Postgres (testcontainers or the compose DB)

**Exit:** after restarting everything, past calls are visible with their transcripts and latency traces. G1 has not regressed.

## Phase 9: Benchmarks

Goal: reproducible, publishable numbers for G1, G2 and G3.

- [ ] Headless benchmark client (rtc-node participant) that plays recorded user utterances into a room and records agent audio
- [ ] Scenarios: normal Q&A, long answers + barge-in at random points, noisy input, back-to-back turns
- [ ] Ground truth: user speech end and barge-in onset are known from the test audio; agent first-frame and stop times come from recorded audio
- [ ] G3 check: compare committed history against the words actually present in the recorded agent audio (via STT on the recording)
- [ ] Report: p50/p95/p99 per metric, latency breakdown per hop, provider and region, hardware, commit SHA; output as JSON + Markdown
- [ ] Optional baseline comparisons: Deepgram Flux end of turn, other LLM models (clearly labelled)

**Exit:** `pnpm bench` produces a report, and G1/G2/G3 results are recorded, whether they pass or not.

## Phase 10: Deploy + README

Goal: anyone can try it and read how it works.

- [ ] Deploy target chosen and recorded (web: static host; api and agent: long-running containers near the LiveKit and provider regions; LiveKit Cloud or self-hosted)
- [ ] Production config, health checks, graceful shutdown (scopes close calls cleanly)
- [ ] Rate limiting and cost guard on `POST /sessions`
- [ ] README: what it is, demo link + video, architecture diagram, the constraint and why, benchmark results with methodology, how to run locally, a short tour of the key files (Turn fiber, PlayoutTracker, TurnDetector)

**Exit:** a public demo URL works, and the README states G1/G2/G3 with links to the benchmark report.

---

## Parking lot

Ideas that came up but belong to no phase yet.

-
