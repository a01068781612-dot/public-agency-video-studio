# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A pipeline that generates a ~10 minute Korean-language YouTube video about AI trends/basics every run, end to end: Claude writes the script, ElevenLabs voices it, a chosen render engine turns it into an mp4, and the YouTube Data API uploads it. `web/` is a small Vercel-hosted trigger UI; `.github/workflows/daily-publish.yml` is the actual execution environment (GitHub Actions), not just CI.

## Commands

```bash
npm install
npx remotion browser ensure       # required once, provisions Chromium for rendering

npm run pipeline                  # full run: script → voice → render → upload
npm run generate:script           # out/script.json (or out/deck.json for deck engines)
npm run generate:voice            # public/audio/*.mp3 + out/manifest.json
npm run render                    # out/video.mp4 (+ out/thumbnail.png)
npm run upload                    # uploads only if DO_UPLOAD=true
npm run thumb                     # regenerate thumbnail only, no re-render
npm run rethumb                   # replace thumbnail on an already-uploaded video (RETHUMB_VIDEO_ID env)
npm run setprivacy                # flip privacy status on an uploaded video (SETPRIVACY_VIDEO_ID/STATUS)
npm run remixbgm                  # remux BGM onto an already-rendered out/video.mp4, no re-encode of video
npm run studio                    # Remotion Studio live preview (illustrated/remotion engines only)
npm run typecheck                 # tsc --noEmit
npm run authorize:youtube         # one-time OAuth flow to mint YOUTUBE_REFRESH_TOKEN
```

All `npm run <x>` pipeline scripts are thin wrappers around `tsx src/pipeline/run.ts --only=<step>` — see Architecture below. There is no test suite and no lint script configured; `typecheck` is the only automated check.

Config is entirely environment-variable driven (`.env` locally, GitHub Secrets/Variables in Actions) — see `.env.example` and `src/config.ts`. `DO_UPLOAD=false` (the local default) renders to `out/video.mp4` without touching YouTube, which is the safe way to iterate.

## Architecture

### Pipeline orchestration (`src/pipeline/run.ts`)

Single entrypoint, four logical steps selected via `--only=`: `script → voice → render → upload`, plus one-off maintenance steps (`thumbnail`, `rethumb`, `setprivacy`, `remixbgm`). State passes between steps through files on disk in `out/` (`script.json`/`deck.json`, `manifest.json`, `video.mp4`, `upload-result.json`) — each step reads what the previous one wrote rather than passing data in-process. This is what lets GitHub Actions run each step as a separate visible workflow step and lets `npm run render` etc. be re-run independently while iterating.

### Two parallel content models: "illustrated" vs "deck"

`config.videoEngine` (env `VIDEO_ENGINE`) selects one of two entirely different content pipelines that share only the script-generation LLM call and the final YouTube upload step:

- **`illustrated`** (default) and legacy **`remotion`**/**`web3d`**: script is a `Script`/scene array (`src/schema.ts`), narrated per-scene via ElevenLabs into separate mp3 files, then composed with **Remotion** (`src/remotion/`). Scenes with `diagram`/`comparison`/`bullets`/`code`/`quote` visuals or a chosen `icon` are drawn entirely in code (`Illustrated.tsx`, `components/iso.tsx`, `components/slides.tsx`, `components/flatIcon.tsx`) — AI image generation (`src/lib/illustrate.ts`, OpenAI or Gemini via `imageProvider`) is only invoked for scenes that need free-form illustration, to control cost and avoid an all-AI-art look.
- **`deck3d` / `signal` / `signal3d`** (`DECK_ENGINES` in `run.ts`): script is instead a "deck" (`src/lib/deckgen.ts` produces `out/deck.json` + `out/deck-meta.json`), rendered by a *separate Node/Playwright toolchain in `web3d-deck/`* (`narrate-deck.mjs` does per-beat TTS, frame-by-frame headless-browser capture, and muxing — not Remotion at all). `stepVoice` is a no-op for these engines because narration timing is generated inside the deck renderer itself. See `web3d-deck/HANDOFF.md` for the deep design rationale (camera choreography, presets, in-progress "workflow-follow" narration-synced camera work) — read it before touching that folder.

`web-engine/` is a third, older/experimental prototype (Playwright-recorded Three.js `demo.html`) — not wired into the pipeline, kept for reference.

`isDeckEngine()` / `loadMeta()` in `run.ts` are the two places that branch on this split; anything touching script generation, rendering, or upload metadata needs to handle both paths.

### Config and multi-channel support (`src/config.ts`)

All tunables (model choice, art style, narration tone, image provider, target length, etc.) resolve through `optional()`/`required()` env lookups with sane defaults — treat this file as the source of truth for what's configurable, not the README (see below). Notable: `TARGET_CHANNEL` lets one pipeline upload to multiple YouTube channels by suffixing env var names (e.g. `YOUTUBE_REFRESH_TOKEN_CH2`), via `chOptional`/`chRequired`; `resolveTopicMode()` alternates trend/basics content by day-of-week, computed in KST regardless of the runner's local timezone (GitHub Actions runs in UTC — this was a past bug).

### Cost tracking

`src/lib/usage.ts` records token/char/image counts across providers (Claude, OpenAI text/image, Gemini image, ElevenLabs) into `out/usage.json`; the workflow encodes aggregated totals into an artifact *name* (`usage__ci-...__tts-...`) so the web app can sum cost across runs without downloading/unzipping artifacts. The same trick is used for upload results (`result__vid-...__pv-...`) to support an "upload as unlisted, review, then flip to public" workflow without extra API calls — see `stepSetPrivacy`/`UPLOAD_RESULT_PATH` in `run.ts` and `web/api/`.

### Web trigger app (`web/`)

Minimal Vercel serverless functions (`web/api/*.js`) that fire a `repository_dispatch` to trigger `daily-publish.yml` remotely (used for on-demand runs from a phone/PC) and poll run status/cost — it holds the GitHub PAT server-side so it's never exposed to the browser. It does not generate or render anything itself.

## Working in this repo

- **Scheduled auto-publish is intentionally disabled** (see comment at the top of `daily-publish.yml`) — it previously ran daily and accumulated cost/unlisted videos. Only trigger real runs (`DO_UPLOAD=true`, or anything that spends API credits) when explicitly asked to; code-only commits are free and fine to do proactively.
- The README is Korean and somewhat behind `src/config.ts`/the workflow file (e.g. it undersells engine/provider choice) — when they disagree, trust the code.
- When adding a new env-driven option, wire it in three places to keep local/CI parity: `src/config.ts` (default), `.env.example` (documented default), and `.github/workflows/daily-publish.yml` `env:` block (Actions default via `vars.*`).
- Scene schema changes (`src/schema.ts`) ripple through prompt-building in `src/lib/anthropic.ts`, the Remotion scene renderer (`src/remotion/components/Scenes.tsx` / `Illustrated.tsx`), and possibly `src/lib/illustrate.ts` — check all three when changing `Scene`/`VisualKind`/`IconKind`.
