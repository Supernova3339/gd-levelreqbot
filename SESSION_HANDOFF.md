# GD Level Request Bot — Session Handoff

## Architecture

```
gd-levelreqbot/
├── desktop/                    ← Tauri 2 desktop app
│   ├── src/                    ← React + TypeScript frontend
│   └── src-tauri/              ← Rust backend
└── gdlevelreqbot-auth-service/ ← Node.js OAuth proxy (gdlqbot.superdev.one)
```

**Stack:** Tauri 2 · React 19 · Rust (Tokio + Axum + sqlx/SQLite) · Rhai scripting · Twitch IRC · YouTube Data API  
**Run:** `npm run tauri:dev` in `desktop/`

---

## What's Working

### Bot

- Twitch IRC + YouTube Live Chat with full OAuth
- **Refresh tokens** — silent auto-refresh on expiry for both Twitch + YouTube
- **Rhai scripting engine** — all commands run as Rhai scripts
- **Built-in commands** (`!request`, `!next`, `!list`, `!pos`, `!remove`, `!clear`, `!info`) fully expressed in Rhai
- Queue operations emit `queue-updated` and `level-nexted` events → UI and overlay refresh
- **Args alias bug fixed** — handler strips the matched trigger word, not `command.trigger`
- **IRC auth fixed** — pre-flight validates token, fetches real username from Twitch validate endpoint, checks
  `chat:read`/`chat:edit` scopes

### Auth Service (`gdlevelreqbot-auth-service/`)

- `force_verify=true` now actually works (fixed `authorizationParams` override)
- `/auth/twitch/refresh` and `/auth/youtube/refresh` endpoints
- Both callbacks pass `refreshToken` in redirect URL
- **Must deploy to `gdlqbot.superdev.one` after any src/ change**

### Frontend

- **Queue** (`Dashboard.tsx`) — two-panel, thumbnails, platform colour
- **Commands** (`CommandsPage.tsx`) — Rhai scripting, save stays on command (no close), Ctrl+S
- **Integrations** (`IntegrationsPage.tsx`) — CRUD with Test button
- **Libraries** (`LibrariesPage.tsx`) — view/edit/fork Rhai library files
- **Settings modal** — Twitch · YouTube · Queue · Appearance · General · Scripting
- **Node canvas** (`NodeCanvas.tsx`) — ReactFlow visual scripting, lazy-loaded so it only parses when used

---

## GDLQScript (Rhai)

### Critical syntax rules

```rhai
// String interpolation: ONLY backtick strings with ${expr}
chat.say(`Hello ${username}!`);       // CORRECT
chat.say("Hello ${username}!");       // WRONG — literal text

// Always call .to_string() on args[0] before passing to Rust functions
queue.add(args[0].to_string());

// parse_int for converting args to numbers
let page = parse_int(args[0].to_string()) ?? 1;

// Random: use rand.int()
let opts = ["A", "B"];
chat.say(opts[rand.int(0, opts.len())]);
```

### Objects in scope

| Object  | Key methods                                                                                                           |
|---------|-----------------------------------------------------------------------------------------------------------------------|
| `chat`  | `.say(msg)`, `.reply(msg)`, `.announce(msg)`                                                                          |
| `queue` | `.add(id)`, `.next()`, `.remove(id)`, `.clear()`, `.size()`, `.isEmpty()`, `.has(id)`, `.list(page)`, `.position(id)` |
| `user`  | `.isMod()`, `.isSub()`, `.isBroadcaster()`, `.isStaff()`, `.name`, `.platform`                                        |
| `store` | `.get(key)`, `.set(key,val)`, `.delete(key)`, `.incr(key)`, `.get_or(key,default)`                                    |
| `data`  | `.insert(col,map)`, `.find(col,n)`, `.find_one(col,id)`, `.count(col)`, `.clear(col)`                                 |
| `gd`    | `.fetch(id)` → Map, `.search(q)`, `.isValidId(s)`                                                                     |
| `rand`  | `.int(lo,hi)`, `.float()`, `.pick(arr)`, `.shuffle(arr)`, `.seed(n)`                                                  |
| `time`  | `.now()`, `.utc()`, `.date()`, `.elapsed(ts)`                                                                         |
| `event` | `.emit(name, payload)`                                                                                                |

**Scope variables:** `username`, `platform`, `args` (Array), `command_trigger`, `queue_size`

**gd.fetch() map keys:** `name`, `id`, `difficulty`, `stars`, `length`, `downloads`, `likes`, `is_demon`, `is_featured`,
`is_epic`

### Directives

```rhai
// @trigger !request
// @alias !r
// @description Add a level to the queue
// @roles everyone          // or: mod, owner, sub
// @platform all            // or: twitch, youtube
// @cooldown 0
// @user_cooldown 30
```

---

## Scripting Library (`desktop/src/lib/scripting/`)

| File                  | Purpose                                                                    |
|-----------------------|----------------------------------------------------------------------------|
| `directives.ts`       | `// @key` parsing/building, `buildScript`, `parseDirectives`               |
| `builtins.ts`         | Default Rhai scripts for all 7 built-ins                                   |
| `templates.ts`        | New-command templates with categories                                      |
| `snippets.ts`         | Snippet definitions for the toolbar                                        |
| `rhai-highlighter.ts` | Syntax highlighting — all regex pre-compiled at module scope, 500-line cap |
| `palette-registry.ts` | **Global registry** — `registerPaletteCategory()`, `getPaletteTree()`      |
| `default-palette.ts`  | Registers all built-in palette entries via the registry API                |
| `index.ts`            | Re-exports + side-effect imports `default-palette.ts`                      |

### Palette registry

Libraries register their own menu entries:

```typescript
import {registerPaletteCategory} from "lib/scripting/palette-registry";

registerPaletteCategory({
    kind: "category", label: "MyLib", color: "#f59e0b",
    children: [
        {
            kind: "leaf", label: "mylib.doThing()", color: "#f59e0b",
            desc: "Does a thing", block: act("mylib.doThing")
        }
    ]
});
```

The block picker and canvas right-click menu both call `getPaletteTree()` and pick up registered entries automatically.

---

## Scripting UI (`desktop/src/components/scripting/`)

### Editor components (`editor/`)

| File                      | Purpose                                                                                               |
|---------------------------|-------------------------------------------------------------------------------------------------------|
| `ScriptEditor.tsx`        | Mode toggle (Visual/Text), lazy-loads NodeCanvas                                                      |
| `TextEditor.tsx`          | Syntax-highlighted textarea — `HighlightLayer` (`React.memo`, 200ms debounce), cursor alignment fixed |
| `EditorToolbar.tsx`       | 36px toolbar — library chips left, snippets/import/export right                                       |
| `VarChipDropdown.tsx`     | 8 library-coloured pill chips, each opens a grouped variable dropdown                                 |
| `SnippetDropdown.tsx`     | Snippets portal picker                                                                                |
| `useEditorErrors.ts`      | Debounced brace-balance check (800ms, skips >500 lines)                                               |
| `useScriptingKeybinds.ts` | Ctrl+S, Ctrl+Shift+M, Ctrl+/ comment toggle                                                           |

**Syntax highlighting:** `HighlightLayer` sits behind a `color: transparent` textarea. Only re-renders when highlighted
HTML changes (memoised). Scroll sync via `useLayoutEffect` after each repaint.

### Canvas components (`canvas/`)

| File                    | Purpose                                                                      |
|-------------------------|------------------------------------------------------------------------------|
| `NodeCanvas.tsx`        | ReactFlow canvas — lazy-loaded, right-click palette, Delete key, lock/unlock |
| `ScriptNode.tsx`        | Single pluggable node component driven by `NodeDefinitions.ts`               |
| `NodeDefinitions.ts`    | All node types, colours, port configs — **add new types here**               |
| `NodeUpdateContext.ts`  | Context so nodes update parent state correctly                               |
| `CanvasContextMenu.tsx` | Right-click canvas → drill-down block picker                                 |
| `NodeContextMenu.tsx`   | Right-click node → delete/duplicate/disconnect                               |
| `graphToRhai.ts`        | Node graph → Rhai source text                                                |
| `PalettePanel.tsx`      | Shared drill-down palette UI (used by BlockPalette + CanvasContextMenu)      |

### Other

- `BlockPalette.tsx` — `AddBlockButton` portal picker using `PalettePanel`
- `NewCommandModal.tsx` — new command modal with template browser + import

---

## Rust Scripting Engine (`src-tauri/src/scripting/`)

```
engine.rs       — create_engine(), type registrations only (no per-call state)
execute.rs      — run_script(), builds Scope, pre-compiled AST cache (hash-keyed)
context.rs      — ScriptCtx struct
stdlib.rs       — OnceLock<AST> cache for arr/fmt/queue/counter .rhai
commands/
  libraries.rs  — get_libraries, save_library, delete_library, get_library_code
proxy/
  chat.rs       — ChatProxy: say, reply, announce
  queue.rs      — QueueProxy: all ops + emits queue-updated / level-nexted events
  user.rs       — UserProxy: isMod/isSub/isStaff/isBroadcaster, name, platform
  store.rs      — StoreProxy: get/set/delete/incr/get_or
  data.rs       — DataProxy: insert/find/find_one/count/clear
  db.rs         — DbProxy: exec/last_id
  gd.rs         — GdProxy: fetch/search/isValidId
  rand.rs       — RandProxy: int/float/pick/shuffle/seed
  time.rs       — TimeProxy: now/utc/date/elapsed
  event.rs      — EventProxy: emit
```

**stdlib .rhai** embedded in `stdlib/`: `arr.rhai`, `fmt.rhai`, `queue.rhai`, `counter.rhai`

---

## Database

SQLite at `AppData/Roaming/one.superdev.gdlqbot/data.db`

Migrations 0001–0017:
| # | What |
|---|------|
| 0012 | `twitch_refresh_token`, `bot_refresh_token` on config |
| 0013 | `youtube_refresh_token` on config |
| 0014 | `library` column on integrations |
| 0015 | `kv_store` table |
| 0016 | `user_data` table |
| 0017 | `libraries` table |

**Delete `data.db` and restart** if there are schema errors.

---

## Key Rust Modules

```
bot/
  handler.rs        — strips matched trigger (not command.trigger) for args
  twitch.rs         — validate_token() checks chat:read + chat:edit scopes
  commands/
    general.rs      — Rhai execution via run_script()
    bot.rs          — pre-flight: validates token, fetches real IRC username
auth/
  twitch.rs         — validate_token() + refresh_access_token()
config/mod.rs       — save_tokens() fallback for old DBs without refresh columns
api/mod.rs          — OAuth callbacks use save_tokens()
```

---

## What's Incomplete

### 1. Visual scripting: node state not persisted

Node graph (positions, edges) is stored in refs in `ScriptEditor` and survives mode switches within a session. But when
you close and reopen a command, the canvas resets. The generated Rhai is saved; the visual layout is not.

**To fix:** Serialize nodes/edges as a JSON comment at the top of the script, or add a DB column.

### 2. Keybinds not registered at runtime

Keybinds are in the DB (`keybinds` table) but `tauri-plugin-global-shortcut` registration isn't wired in `lib.rs`.
Keybind settings UI also doesn't exist yet.

### 3. Scripting settings: Ctrl+S behaviour

`ctrlSBehavior: "save" | "save-stay"` was added to `useScriptingPrefs` but `CommandsPage.tsx` doesn't read it yet — it
always saves-and-stays currently.

### 4. WebSocket integration

`integrations/mod.rs` returns an error for "websocket" kind — needs a persistent WS connection manager.

### 5. Libraries page: stdlib shows embedded content

The Libraries page seeds stdlib from the embedded `.rhai` files. Changes to stdlib via the Libraries UI are saved to the
`libraries` DB table, but the **scripting engine ignores them** — it only uses the pre-compiled `OnceLock` ASTs from the
embedded files. User forks of stdlib functions need a way to override the engine's loaded modules.

---

## Common Issues

| Symptom                                 | Cause                                                  | Fix                                                              |
|-----------------------------------------|--------------------------------------------------------|------------------------------------------------------------------|
| `chat.say` outputs literal `{username}` | Using double-quoted strings                            | Switch to `` `...${username}...` ``                              |
| "X is not a valid level ID" with alias  | Old handler bug                                        | Fixed — handler strips matched word                              |
| "Login authentication failed" IRC       | Missing `chat:read`/`chat:edit` scopes                 | Deploy auth service, reconnect Twitch                            |
| IRC connects but wrong account          | `bot_username` was stale                               | Fixed — now fetches username from validate                       |
| Twitch OAuth skips auth screen          | `force_verify` wasn't in URL                           | Fixed in `strategies/twitch.js`                                  |
| Auth callback "could not save token"    | Old DB missing refresh columns                         | `save_tokens()` handles this gracefully                          |
| Syntax highlighter crashes/freezes      | (Fixed) — was an infinite loop in character scanner    | Now has explicit fallthrough                                     |
| Multiple ReactFlow instances OOM        | (Fixed) — was keeping canvas mounted in `display:none` | Now lazy-loaded, unmounts on mode switch                         |
| Cursor misaligned in editor             | (Fixed) — overlay/textarea used different wrap         | Now both `white-space: pre`, scroll synced via `useLayoutEffect` |

---

## Auth Service Deployment Checklist

After deploying `gdlevelreqbot-auth-service/`:

1. Go to Settings → Twitch → Disconnect → Connect
2. Twitch shows authorization screen (force_verify fixed)
3. Click Authorize → fresh token with `chat:read chat:edit`

---

## File Paths

- DB: `C:\Users\Nova\AppData\Roaming\one.superdev.gdlqbot\data.db`
- User templates: `C:\Users\Nova\AppData\Roaming\one.superdev.gdlqbot\user_templates.json`
- Auth service: `C:\Users\Nova\WebstormProjects\gdlevelreqbot-auth-service\`
- Desktop app: `C:\Users\Nova\WebstormProjects\gd-levelreqbot\desktop\`

---

## Patterns

- **Rhai strings:** backtick + `${expr}` for dynamic, double-quotes for literals
- **New palette entries:** call `registerPaletteCategory()` — appears in all pickers automatically
- **New node types:** add to `NodeDefinitions.ts` only
- **New script actions:** add match arm to `dispatch()` in the relevant proxy file
- **New Tauri commands:** add to `commands/mod.rs` + register in `lib.rs`
- **Migrations:** new `000N_name.sql`, never modify existing
- **File size limit:** no file over ~150 lines
- **Icons:** `components/icons/index.tsx` (inline SVG) + lucide-react (already installed)
- **UI components:** `components/ui/` (Button, Badge, Select, Input, Dropdown)
- **No `console.log` in Rust** — use `tracing::{info, warn, error}`

---

## Planning Docs

- `SCRIPTING_PLAN.md` — full language design, API reference, data storage
- `QUEUE_LIST_BREAKDOWN.md` — queue.list call chain
- `DATA_STORAGE.md` — three storage tiers
