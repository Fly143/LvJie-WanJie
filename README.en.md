<div align="center">

# LvJie (旅界)

**AI-driven multi-world open-world text adventure**

[简体中文](README.md) · [English](README.en.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Android-blue.svg)](https://github.com/Fly143/LvJie-WanJie/releases)
[![Release](https://img.shields.io/badge/release-v0.4.0-blue)](https://github.com/Fly143/LvJie-WanJie/releases)
[![Electron](https://img.shields.io/badge/Electron-33-47848f.svg)](https://www.electronjs.org/)

Pick a world — Xianxia / Xuanhuan / Wuxia / Workplace / Apocalypse / Western Fantasy — plug in your own LLM API, and play a story that writes and updates game state in real time.

</div>

---

## Features

- Six complete world packs: level tables, currencies, scene actions, advancement verbs, theme skins, AI house rules
- **Custom world packs**: import JSON, or generate a draft from a book title / setting via AI (Welcome → "🛠 Custom World")
- Bring your own model: Base URL + API Key + model; **chat** / **response** protocols
- **Built-in free channel**: with no configuration, the app probes upstream free models at startup and works out of the box; your own keys are never overridden
- Pull model lists from `GET {Base URL}/models`
- Event loop: actions / options / free text → JSON `changes` auto-applied (money, progress, items, map, companions, quests)
- Four adjustable AI play-styles: Cheat / Generous / Normal / Hard (switch in Settings; tunes judgment strictness and reward generosity)
- Trackable quests: accept / complete / fail into the sidebar; rewards write to stats
- Background music: mp3 and **MIDI** (Web Audio synthesis)
- Streaming chat; per-turn value circuit breaker; export / import save JSON (keys excluded)
- Character memory: companions and scene NPCs persist; named lookups inject dossiers on demand
- **Travel together & party**: invite companions to follow you across locations; a party panel shows party power, days together and recent notes, with a once-per-day "spar & talk"; companions age as game days pass
- **UI languages**: 简体中文 / 繁體中文 / English / 日本語
- Per-world save slots; switching worlds loads that world's save
- API keys stored encrypted (Desktop safeStorage / Android Keystore), never inside save files

## Layout

| Path | Description |
|------|-------------|
| `app/` | Game client (HTML/CSS/ESM JS) |
| `app/js/engine/` | Engine: saves, progression, inventory, map, prompts, LLM, i18n |
| `app/js/engine/book-ingest.js` | Whole-book sampling and lore merge |
| `app/js/engine/book-web.js` | Web research (wikis / setting pages) |
| `app/js/engine/worldpack.js` | Declarative world-pack schema (validate / draft prompts) |
| `app/js/engine/custom-packs.js` | Custom pack persistence |
| `app/js/worldviews/` | Built-in world packs (lexicon / numbers / maps / rules) |
| `main.js` / `preload.js` | Electron main process / renderer bridge |
| `android/` | Android WebView shell (shares the `app/` engine) |
| `runtime/` | Official Electron runtime + synced game files (**not in git**) |
| `scripts/` | Launch, runtime sync/rebuild, smoke tests |

## Run

### Windows (no build)

Download `LvJie-*-win-x64.zip` from [Releases](https://github.com/Fly143/LvJie-WanJie/releases), unzip, and double-click **`AgentWorlds.exe`**.

### Linux / dev machine (no packaging)

```bash
npm install
npx electron .
```

(`electron` is a dev dependency only; the game itself is native ESM with no bundler.)

### Windows from source

```bash
npm start    # sync app/ → runtime/resources/app/ and launch AgentWorlds.exe
```

If `runtime/` is missing: `npm run rebuild:runtime` (set `AW_ELECTRON_ZIP` to use a local official Electron zip).

During development, refresh assets only: `npm run sync`

## API setup

**Works out of the box via the built-in free channel.** On first launch with no configuration, the app fetches the upstream free-model list and probes them in order, using the first one that responds — no API key needed. If a call fails (403/426/429 …) it automatically switches to the next free model. The free list rotates upstream: the app **fetches the latest list on every start** and skips the connection test when the list is unchanged (`GET /models` does not use chat quota); when the list changes it probes again.

API settings has two modes, switchable at the top:

| Mode | What it does |
| --- | --- |
| **Built-in free** | Pick from the probed free models (defaults to the first working one); "Test channel" re-probes; one tap to enable. Upstream quota is about **100 requests/day** (resets next day); the panel shows how many you have sent today |
| **Custom** | Your own Base URL / API key / model; multiple saved profiles with switching, plus "Test connection" |

> This channel works by injecting a client fingerprint and is **experimental**: upstream tightening can break it at any time — then just enter your own API key. When the quota runs out (429 `FreeUsageLimitError`) the app states the reason and your usage count and suggests switching to your own key; using your own key is recommended anyway (more stable, more models, no daily cap).

With your own model, in the **Custom** panel:

1. Choose protocol
   - `chat` → `POST {Base URL}/chat/completions`
   - `response` → `POST {Base URL}/responses`
2. Fill in Base URL, model name, API Key
3. Optionally hit **Refresh models** (`GET {Base URL}/models`)

Existing user configuration is never overridden by the built-in channel. Keys are stored via the platform secure store when available and never written into save JSON.

### One-tap provider presets

The **Custom** panel starts with presets for common providers: **Intern-AI (Shanghai AI Lab)**, SenseNova, DeepSeek, Zhipu GLM, SiliconFlow. One tap fills the Base URL and model; you only paste your own API key (the panel shows where to get one), then hit "Test connection".

> **Intern-AI** is an officially free API (about 30 RPM, 90M tokens/month — see their announcements; get a token from the console after signing up). Being an official endpoint it is far more stable than the experimental built-in channel, so it is the recommended first choice. That endpoint does not accept `response_format`, so the app skips that field automatically (the prompt contract plus the recovery chain cover it), avoiding wasted retries.

## Custom worlds

Welcome screen **🛠 Custom World**:

1. **From a work**: title + setting brief (optional level list) → AI draft
2. **Full novel**: upload/paste TXT; sample beginning / middle / end chapters → merge lore → draft
3. **Web research**: prefer accessible wikis, optional fallbacks; or paste setting-page URLs
4. **NPC seeds**: pick main characters from research → 8–12 dossier-backed `map.people` entries
5. **Paste JSON**: validated against `worldpack.js` before save
6. Custom worlds appear on the welcome screen with their own save slots; exportable as JSON

## Worlds

| Pack | Advance | Progress | Sample actions |
|------|---------|----------|----------------|
| Xianxia | Breakthrough | Cultivation | Travel, hunt demons, meditate |
| Xuanhuan | Realm break | Spirit power | Explore, challenge, breathe |
| Wuxia | Refine | Inner force | Roam the jianghu, spar, circulate |
| Workplace | Promote | Rep / XP | Negotiate, network, seek chances |
| Apocalypse | Evolve | Evo points | Scavenge, hunt, stand watch |
| Western Fantasy | Rank up | Mana / XP | Adventure, slay, contemplate |

## Build from source

`master` contains both the **Windows desktop** and **Android** projects.

### Windows executable / portable zip

```bash
npm install                # optional (electron devDependency)
npm run rebuild:runtime    # or supply runtime/ yourself
npm start                  # sync app/ and launch
# portable zip: pack the whole runtime/ directory
```

### Android APK

```bash
node scripts/sync-android.js   # sync app/ into android assets
cd android
# requires JDK 17 + Android SDK 35 (JAVA_HOME / ANDROID_HOME)
gradlew.bat assembleRelease
# output: android/app/build/outputs/apk/release/app-release.apk
```

## Scripts

```bash
npm install           # install deps
npm start             # sync runtime and launch
npm run sync          # sync app → runtime/resources/app only
npm run rebuild:runtime
npm run smoke:engine
npm run smoke:book
npm run smoke:chars
npm run smoke:npc
npm run smoke:quest
npm run smoke:llm
npm run smoke:stage
```

## Notes

- Progress is stored per world in localStorage; clearing site/app data loses saves
- API keys are stored separately and survive deleting a single world save
- Stories are AI-generated and may contain fiction or errors

## License

[MIT](LICENSE) © Fly143

See [CHANGELOG.md](CHANGELOG.md) for release notes.
