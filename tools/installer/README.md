# Custom cross-platform installer

A fully custom installer/uninstaller for the desktop app + CLI — Tauri's own bundlers (NSIS/MSI/DMG/AppImage/deb) are
never used. One binary is the GUI setup wizard (Tauri 2 + React + Tailwind, same design tokens as the app), the
silent/unattended CLI, **and** the uninstaller.

## Layout

```
installer.config.json   All branding & behavior: icon, ToS file, homepage,
                        component defaults, optional marketplace offers,
                        preset app settings. No code changes to rebrand.
assets/TERMS.md         Terms of service shown in the wizard.
build.mjs               The "bundler plugin": builds the app with
                        `tauri build --no-bundle` (macOS: `--bundles app`),
                        stages app + CLI, packs the payload, generates the
                        manifest, compiles the installer with it embedded.
ui/                     Setup frontend (Vite + React + Tailwind 4, same design
                        tokens as the app). Classic installer wizard: header
                        strip, ruled content, Back/Next/Cancel row; License →
                        Components → Optional Modules → progress with a details
                        log. Confirmations/messageboxes via DialogProvider
                        (components/Modal.tsx).
src/
  main.rs               Entry: arg parsing, silent vs GUI dispatch.
  args.rs               All flags + exit codes.
  headless.rs           --silent flow (logs to %TEMP%/<product>-setup.log).
  gui.rs / ipc.rs       Tauri shell + commands/events for the wizard.
  manifest.rs           Embedded payload/manifest/icon + dev stub.
  install/              Engine: options, payload, record, run, seed, dry_run.
  platform/             windows.rs (registry, shortcuts, PATH, .gdlqs/.gdui/
                        .rhai associations),
                        macos.rs (lsregister, CLI symlink),
                        linux.rs (.desktop, MIME, icons, ~/.local/bin).
  sys/                  process detection, paths, logging.
```

## Building an installer

```
node build.mjs                     # full build (app + UI + installer)
node build.mjs --skip-app-build    # reuse target/release artifacts
node build.mjs --debug             # debug installer binary
```

Output lands in `dist/` as `<slug>-setup-v<version>-<os>-<arch>[.exe]`.

## Developing the installer

Run configuration **Installer: dev (tauri+vite)** — or `npm run dev:app` in
`ui/` — starts `tauri dev` with hot reload. Debug builds without a payload run against a stand-in manifest with
**dry-run forced**: the wizard walks every step and reports what it *would* do, but writes nothing. Dev builds also show
a dry-run checkbox on the Components page.

## Flags

```
--silent /S            no UI; requires --accept-license
--unattended           progress UI only, no questions
--uninstall [--purge]  remove (purge = also delete app data)
--dir <path>           install location
--with-cli / --no-cli  CLI + PATH
--enable-dev           enable the in-app Development tab (implies CLI)
--offers a,b / --no-offers   accept/decline optional marketplace offers
--preset <file.json>   pre-seed app settings
--kill-running         close a running app instead of aborting
--dry-run              simulate everything
```

Exit codes: 0 ok · 1 error · 2 license not accepted · 3 app running · 4 bad args · 5 setup already running
(single-instance lock).

## How the app learns about the install

The installer writes `install.json` into the app data dir:
`dev_enabled` + `dev_blessing` (gates the Development settings tab — the blessing is a machine-bound hash only the
installer writes and the app verifies, so hand-editing `dev_enabled: true` or copying the file from another machine does
nothing; see src/sys/blessing.rs), `cli_installed`,
`preset` + `preset_applied` (one-shot preset settings), and
`pending_modules` (accepted marketplace offers, installed by the app on next launch via `take_pending_module_installs`).

Updates are detected via the platform registration (Windows registry / .desktop file) plus `install-manifest.json` in
the install dir; the wizard switches to update mode and preserves user data.

## The uninstaller

The same binary, copied into the install dir as `uninstall(.exe)` at install time and registered with Add/Remove
Programs (`UninstallString` /
`QuietUninstallString`); the Start Menu folder also gets an
"Uninstall <Product>" shortcut. It removes: payload files, registry keys (uninstall entry, App Paths, file
associations), shortcuts, the CLI's PATH entry, autostart entries (HKCU Run values / `~/.config/autostart` /
`~/Library/LaunchAgents` pointing at the install), and the installer's own webview cache. With `--purge` it also deletes
every Tauri data location for the app identifier: roaming data, local data (WebView2 `EBWebView`), config, caches and
logs. Self-deletion (and anything the live webview still holds open) is handed to a detached shell that runs after the
process exits.

Testing escape hatch: `GDLQB_SETUP_IGNORE_RUNNING=1` skips the running-app check so install/uninstall can be exercised
while a dev instance is up.

## Making tauri-plugin-updater accept our installer

`tauri-plugin-updater` doesn't care what produced an artifact — it only requires a valid minisign signature against the
pubkey configured in
`desktop/src-tauri/tauri.conf.json` (`plugins.updater.pubkey`). Tauri's own bundlers get one for free via
`createUpdaterArtifacts`; since we build with
`--no-bundle`, build.mjs signs the installer itself (step 9) using the same key, via `npx tauri signer sign`. Needs
`TAURI_SIGNING_PRIVATE_KEY` (and
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if the key has one) in the environment — without it, the step is skipped with a
warning and the build is unsigned (fine locally, useless for shipping an update).

The other half is *how* the updater invokes the downloaded file. On Windows its default `installMode` ("passive") always
prepends NSIS-specific flags (`/P /R`) that our arg parser has never heard of, and it would refuse to start.
`windows.installMode: "basicUi"` is the only mode that adds no built-in flags, leaving just our own
`windows.installerArgs`:
`["--silent", "--accept-license", "--kill-running"]` — a fully headless update that closes the running app itself rather
than erroring out.

`tools/release/release.mjs` discovers `{slug}-setup-v{version}-<platform>-<arch>[.exe]`

+ `.sig` pairs straight out of `tools/installer/dist/` (config's `bundleDir`)
  instead of scanning Tauri's old NSIS/MSI/DMG/AppImage bundle folders, which no longer exist.

**macOS/Linux caveat**: only the Windows invocation path is generic in tauri-plugin-updater — its macOS/Linux code
assumes a `.app.tar.gz` /
`.AppImage`-shaped artifact and replaces the bundle in place. Our installer doesn't produce those shapes, so auto-update
via the plugin is Windows-only today; macOS/Linux would need either matching those archive formats or a small custom
update-check flow that just downloads and runs our installer with `--silent --accept-license --kill-running` directly.
