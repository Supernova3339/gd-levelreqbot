# Project Index: gd-levelreqbot

Generated: 2026-09-07 (updated from 2026-07-28)

## Overview

A Geometry Dash Level Request Bot for Twitch and YouTube Live. Stream viewers/subscribers submit GD level IDs via chat
commands; the bot manages a persistent queue and gives the streamer tooling to navigate it. The v2 rewrite (`v2-dev`
branch) is a ground-up replacement of the original Node.js bot: a **Tauri 2 desktop app** (Rust + React + SQLite) with a
marketplace-driven module system and a custom installer, backed by PHP services.

---

## Project Structure

```
gd-levelreqbot/
├── desktop/                    # Tauri 2 desktop app (v2 rewrite)
│   ├── src/                    # React/TypeScript frontend
│   │   ├── App.tsx             # Root component & app state machine
│   │   ├── main.tsx            # React entry point
│   │   ├── pages/              # Top-level pages
│   │   │   ├── CommandsPage.tsx
│   │   │   ├── LibrariesPage.tsx / libraries/
│   │   │   ├── IntegrationsPage.tsx
│   │   │   ├── ConsolePage.tsx
│   │   │   ├── ModulesPage.tsx + modules/   # Marketplace UI (catalog, detail, submit/seed, admin)
│   │   │   ├── Setup.tsx       # First-run setup wizard
│   │   │   └── settings/       # Per-section settings panels (13 panels)
│   │   ├── components/
│   │   │   ├── Layout.tsx, StatusBar.tsx, sidebar/
│   │   │   ├── SettingsModal.tsx, AboutModal.tsx, ChangelogModal.tsx, UpdateBar.tsx
│   │   │   ├── scripting/      # Script editor feature (text + visual + canvas)
│   │   │   ├── modules/gdui/   # GDUI v2 component framework (renders module-authored pages)
│   │   │   ├── BlockEditor/, dev/, icons/
│   │   │   └── ui/             # Shared primitives (Button, Input, Badge, Select)
│   │   ├── hooks/              # React hooks (useConfig, useQueue, useCommands…)
│   │   └── lib/
│   │       ├── types.ts        # Shared TypeScript types (AppConfig, GDLevel, QueueEntry…)
│   │       ├── commands.ts     # Tauri invoke wrappers
│   │       ├── consoleStore.ts # In-app console log state
│   │       └── scripting/      # Scripting engine helpers (directives, highlighter, snippets…)
│   └── src-tauri/              # Rust backend
│       ├── src/
│       │   ├── main.rs         # Binary entry point → lib::run()
│       │   ├── lib.rs          # Tauri setup, state init, invoke_handler registration
│       │   ├── api/            # Axum REST API server (port 24363)
│       │   ├── auth/           # OAuth flows: Twitch + YouTube
│       │   ├── bot/            # Chat bot: Twitch IRC + YouTube polling, command dispatch
│       │   ├── commands/       # All tauri::command handlers (thin IPC layer) — 18 modules incl. marketplace.rs, modules.rs, licensing.rs, install_info.rs, templates.rs, update.rs
│       │   ├── config/         # AppConfig load/save (SQLite-backed)
│       │   ├── gd/             # Geometry Dash API client
│       │   ├── integrations/   # Third-party integration hooks
│       │   ├── modules/        # Installed-module bookkeeping (ModuleManifest, enable/disable, bundles)
│       │   ├── queue/          # Queue state + SQLite persistence
│       │   ├── scripting/      # Rhai engine, stdlib, proxy modules
│       │   └── ws/             # Optional WebSocket server
│       └── Cargo.toml
├── tools/
│   ├── installer/               # Custom Tauri installer (wizard + silent CLI + uninstaller); replaces Tauri's built-in bundlers
│   ├── gd-proxy.js              # Standalone GD API proxy
│   └── release/                 # Release packaging scripts
└── external/                    # PHP backend services
    ├── server/                  # Marketplace/licensing API (Controllers/Middleware/Repositories/Services)
    ├── marketplace/             # Marketplace catalog endpoints + schema
    ├── licensing/                # License key verification + GitHub-based auth
    ├── telemetry/                # Anonymous usage collection
    ├── updates/                  # Update manifest for tauri-plugin-updater
    └── external.zip              # Packaged snapshot of the above for deployment
```

---

## Entry Points

| Layer             | Path                               | Role                                                             |
|-------------------|------------------------------------|------------------------------------------------------------------|
| Desktop binary    | `desktop/src-tauri/src/main.rs`    | Calls `gdlqbot_lib::run()`                                       |
| Rust lib          | `desktop/src-tauri/src/lib.rs`     | Tauri setup, state management, command registration              |
| React root        | `desktop/src/main.tsx`             | Mounts `<App/>`                                                  |
| App state machine | `desktop/src/App.tsx`              | Routes between `loading → setup → main / demo`                   |
| REST API          | `desktop/src-tauri/src/api/mod.rs` | Axum server on port 24363                                        |
| Custom installer  | `tools/installer/`                 | Tauri wizard + silent CLI; writes `install.json` bridge          |
| Marketplace API   | `external/server/public/`          | PHP entry for Controllers (catalog, submit, review, admin, auth) |

---

## Core Rust Modules

### `bot/`

- `mod.rs` — `BotState` (Arc RwLock), start/stop coordination
- `twitch.rs` — Twitch IRC client via `twitch-irc`; handles chat messages
- `youtube.rs` — YouTube Live Chat polling
- `handler.rs` — Routes chat messages to bot commands
- `cmd_cache.rs` — In-memory command registry (reloaded from DB on change)
- `commands/` — Built-in bot commands: `!add`, `!next`, queue info, general

### `scripting/`

- `engine.rs` — Rhai `Engine` setup; registers all proxy modules; AST caching
- `execute.rs` — Runs scripts in response to chat commands
- `context.rs` — Per-execution context (username, message, platform)
- `stdlib.rs` — Stdlib library sources (arr, fmt, queue, counter, str, io)
- `commands/libraries.rs` — Library CRUD commands
- `proxy/` — One module per Rhai API namespace: `gd`, `queue`, `user`, `db`, `data`, `event`, `console`, `shell`, `io`,
  `web`, `store`, `rand`, `time`, `chat`, `twitch`, `youtube`, `module_store`

### `modules/`

- `mod.rs` — Installed module bookkeeping: `ModuleManifest` (with serde defaults for `builtin`/`enabled`),
  enable/disable, local install vs. package-bundle handling

### `commands/`

- `marketplace.rs` — Marketplace browse/install/submit/review IPC
- `modules.rs` — Local module management IPC
- `licensing.rs` — License activation/verification IPC
- `install_info.rs` — Reads installer bridge (`install.json`)
- `templates.rs`, `update.rs`, `keybinds.rs`, `ws.rs`, `dev.rs` — supporting IPC groups

### `queue/`

- `mod.rs` — `QueueState` (viewer + subscriber queues)
- `db.rs` — SQLite init and migrations via sqlx

### `config/`

- `mod.rs` — `AppConfig` with nested `auth`, `modes`, `limits`, `ws` structs; stored in SQLite

### `auth/`

- `twitch.rs` — OAuth PKCE flow for streamer + bot accounts
- `youtube.rs` — YouTube OAuth flow

---

## Core Frontend Modules

### Pages

| Page         | Path                                         | Purpose                                                                                                                                              |
|--------------|----------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------|
| Commands     | `src/pages/CommandsPage.tsx`                 | CRUD for chat commands + script editor                                                                                                               |
| Libraries    | `src/pages/LibrariesPage.tsx` + `libraries/` | Rhai script library management                                                                                                                       |
| Integrations | `src/pages/IntegrationsPage.tsx`             | Third-party integration config                                                                                                                       |
| Console      | `src/pages/ConsolePage.tsx`                  | Live bot console log viewer                                                                                                                          |
| Modules      | `src/pages/ModulesPage.tsx` + `modules/`     | Marketplace catalog, detail view, submit/seed flows, admin panels                                                                                    |
| Setup        | `src/pages/Setup.tsx`                        | First-run wizard                                                                                                                                     |
| Settings     | `src/pages/settings/`                        | 13 panels: General, Appearance, Platforms, Twitch, YouTube, GD, Commands, Scripting, Keybinds, WebSocket, Teams, Vanity, Startup, About, Development |

Note: `pages/modules/_design_v1_backup/` and `_design_v2_metro_backup/` hold superseded `.bak` designs — not live code.

### Module Marketplace (`src/pages/modules/`)

- `ModuleCatalogList.tsx`, `ModuleDetail.tsx` — browse/view marketplace packages
- `SubmitModal.tsx`, `SeedModal.tsx`, `CreateModal.tsx` — author-side flows
- `AdminPanels.tsx`, `ModuleFeedback.tsx` — review/moderation
- `useMarketplace.ts`, `usePackageMarketplace.ts`, `useAccount.ts`, `marketplace-api.ts` — data layer

### GDUI v2 Component Framework (`src/components/modules/gdui/`)

Declarative widget system that renders module-authored pages (`PageRenderer.tsx`, `parser.ts`, `context.tsx`):

- `widgets/layout/` — Card, Grid, Stack, Tabs, Accordion, Drawer, TwoColumn, Divider, Spacer, Inset, ScrollArea
- `widgets/display/` — Text, Heading, Badge, Icon, Table, List, Chart, Timeline, StatCard/StatBar, Progress (Ring),
  Alert, Avatar, Tooltip, KVList, TagList, etc.
- `widgets/inputs/` — Button, Input, Select, MultiSelect, Toggle, Checkbox, RadioGroup, Slider, Form, ConfirmButton,
  CopyButton, ActionBtn/ActionMenu
- `widgets/data/` — Conditional, Each, Toolbar (control-flow/data-bound widgets)
- Icon namespaces: `lucide:` / `builtin:` / `local:`; hooks `useAction.ts`, `useEval.ts` bind widget actions to
  Rhai/module scripts

### Scripting Editor (`src/components/scripting/`)

Three editing modes per command:

- **Text editor** (`editor/ScriptEditor.tsx`) — Rhai code editor: syntax highlighting, find/replace, autocomplete,
  directive panel, test runner, keybind help
- **Visual editor** (`visual/VisualEditor.tsx`) — Block-based drag-and-drop; codegen → Rhai via `visual/RhaiCodegen.ts`
- **Canvas editor** (`canvas/NodeCanvas.tsx`) — ReactFlow node graph; serialized to Rhai via `canvas/graphToRhai.ts`;
  per-node configs in `canvas/configs/`
- `ModuleUpdateDiffModal.tsx`, `NewCommandModal.tsx` — module script update/creation flows

### Hooks

| Hook                | Purpose                                  |
|---------------------|------------------------------------------|
| `useConfig`         | Load/save `AppConfig` via Tauri invoke   |
| `useQueue`          | Real-time queue state (listen to events) |
| `useCommands`       | Command CRUD                             |
| `useKeybinds`       | Global keybind context                   |
| `useBotStatus`      | Poll bot connected/stopped/error state   |
| `useScriptingPrefs` | Per-user scripting preferences           |

---

## Key Types (`src/lib/types.ts`)

```typescript
AppConfig       // auth, modes, limits, ws, setup_complete, auto_copy_level_id
GDLevel         // level_id, name, difficulty, stars, demon, downloads…
QueueEntry      // id, level_id, username, is_subscriber, position, platform
BotStatusResponse // status, twitch_connected, youtube_connected
Keybind         // action, shortcut
```

---

## Configuration

Config is stored in **SQLite** (no JSON files in v2). Loaded at startup via `config::AppConfig::load(&pool)`.

| Setting group | Key fields                                                      |
|---------------|-----------------------------------------------------------------|
| `auth`        | bot_username, channel, twitch/youtube tokens                    |
| `modes`       | gd (validate level IDs), sub (subscriber queue), smart, youtube |
| `limits`      | viewer_request_limit, subscriber_request_limit                  |
| `ws`          | enabled, port, secret                                           |

---

## REST API (port 24363)

Axum server started in `api/mod.rs`. Authenticated with bearer token from config.

Key endpoint groups (same as v1):

- `POST /api/queue/add` — Add level to queue
- `POST /api/queue/next` — Advance to next level
- `DELETE /api/queue/delete` — Remove by ID
- `POST /api/queue/clear`
- `POST /api/queue/list` — Paginated listing
- `POST /api/queue/position`
- `GET /api/system/checkForUpdates`

---

## Scripting System (Rhai)

Commands run Rhai scripts. The engine proxies a rich standard library into scripts:

| Proxy module   | Exposes                                                       |
|----------------|---------------------------------------------------------------|
| `gd`           | `search_level`, `get_user`                                    |
| `queue`        | `add`, `remove`, `next`, `list`, `position`, `size`           |
| `chat`         | `say`, `reply`                                                |
| `store`        | Persistent key-value store per command                        |
| `web`          | HTTP fetch                                                    |
| `io`           | File I/O, JSON/CSV parsing                                    |
| `time`         | `now`, `sleep`                                                |
| `rand`         | Random number / choice                                        |
| `console`      | In-app log output                                             |
| `event`        | Emit Tauri events                                             |
| `module_store` | Per-module persistent storage (marketplace-installed modules) |

Stdlib libraries (arr, fmt, queue, counter, str, io) are seeded into the DB on startup and importable in scripts.
Module-authored scripts are restricted to a stock subset (`ms`/`chat`/`user`/`event`/`time`/`rand`/`io`) — no injected
globals like `sub_mode`.

---

## Module & Marketplace System

Modules are self-contained command/UI bundles distributed via a marketplace, not hardcoded in migrations:

- **Backend**: `desktop/src-tauri/src/modules/mod.rs` tracks installed modules (`ModuleManifest`), local installs, and
  package bundles (`.gdpck`); `commands/marketplace.rs` + `commands/modules.rs` expose IPC.
- **Frontend**: `src/pages/modules/` (catalog/detail/submit/admin) + `src/components/modules/gdui/` (renders module UI
  pages via `PageRenderer`).
- **Server**: `external/server/src/Controllers/CatalogController.php`, `SubmitController.php`, `ReviewController.php`,
  `TeamController.php`, `AdminController.php` back the marketplace; `external/marketplace/` holds the legacy/simpler
  catalog endpoint + schema.
- Commands are only ever added/removed via module install/uninstall flows — never hardcoded into DB migrations.

---

## Custom Installer (`tools/installer/`)

Replaces Tauri's built-in bundlers with a bespoke Tauri app:

- Wizard UI + silent CLI mode + uninstaller
- Writes `install.json`, read by `desktop/src-tauri/src/commands/install_info.rs` to bridge install-time choices into
  the running app
- Own `Cargo.toml`/`tauri.conf.json`, packaged independently from `desktop/`
- Built for both **Windows** and **Linux** now (`tools/installer/dist/windows/`, `tools/installer/dist/linux/`), each
  with a signed installer binary + `.sig` file
- `tools/release/` — Node release packaging scripts (`release.mjs`, `release.config.json`) that drive building/signing
  installer artifacts

---

## Key Dependencies

### Rust

| Crate                | Purpose                           |
|----------------------|-----------------------------------|
| `tauri 2`            | Desktop app framework             |
| `tokio`              | Async runtime                     |
| `axum 0.7`           | REST API server                   |
| `sqlx 0.7 (sqlite)`  | Database ORM                      |
| `twitch-irc 5`       | Twitch chat client                |
| `reqwest 0.12`       | HTTP client (Twitch/YouTube APIs) |
| `rhai 1`             | Scripting engine                  |
| `serde / serde_json` | Serialization                     |
| `tracing`            | Structured logging                |

### Frontend

| Package           | Purpose                      |
|-------------------|------------------------------|
| `react 18`        | UI framework                 |
| `@tauri-apps/api` | IPC bridge                   |
| `reactflow`       | Visual/canvas script editors |
| `tailwindcss`     | Utility CSS                  |
| `typescript`      | Type safety                  |

---

## External Services (`external/`)

PHP services hosted separately:

- `server/` — Full marketplace/licensing API: Controllers (Admin, Auth, Catalog, Gdpr, Health, Me, Report, Review,
  Submit, Team, Verify), Middleware (Auth, Cors, RateLimit, RequireAuth, Role), Repositories, Services (GithubOAuth,
  GithubRelease, Captcha, Sponsor, Token), Support (Categories, Vanity, PackageNamespace, ModuleFormatter)
- `marketplace/` — Lighter-weight catalog endpoint + schema (earlier iteration, still in use)
- `licensing/` — License key verification + GitHub-based auth
- `telemetry/` — Anonymous usage collection
- `updates/` — Update manifest for `tauri-plugin-updater`

---

## Quick Start (Desktop v2)

```bash
cd desktop
npm install
npm run tauri dev     # dev mode (Vite + Rust)
npm run tauri build   # production build
```

Rust target: `desktop/src-tauri/` — standard `cargo build` also works for backend-only work.

Custom installer: `cd tools/installer && npm install && npm run tauri build`
