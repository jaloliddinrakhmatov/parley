# Parley

[![CI](https://github.com/jaloliddinrakhmatov/parley/actions/workflows/ci.yml/badge.svg)](https://github.com/jaloliddinrakhmatov/parley/actions/workflows/ci.yml)

A realtime voice agent you call from the browser. It answers out loud with low latency, and you can interrupt it mid-sentence. LiveKit carries the audio; the voice pipeline (turn detection, barge-in, cancellation, history truncation) is written from scratch on [Effect](https://effect.website).

**Targets, to be measured and published:** p50 < 800 ms from end of speech to first agent audio · agent audio stops < 150 ms after the user starts talking · after an interruption, history contains only the words the user actually heard.

**Status:** Phase 0 (scaffold) done. See the [roadmap](docs/ROADMAP.md), the [decision log](docs/DECISIONS.md) and the [architecture and conventions](CLAUDE.md).

```sh
pnpm install
cp .env.example .env   # then fill in
pnpm dev               # web on http://localhost:5173, API on :3001
```
