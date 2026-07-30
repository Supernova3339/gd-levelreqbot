#!/usr/bin/env node
/**
 * GD Level Request Bot — custom installer builder ("bundler plugin")
 *
 * Replaces Tauri's bundlers on Windows/macOS entirely: those builds run with
 * --no-bundle (macOS: --bundles app, since a bare Mach-O binary is not a
 * launchable app), so NSIS/MSI/DMG are never produced there. The staged app +
 * CLI are packed into a compressed payload and embedded — together with a
 * manifest generated from tauri.conf.json + installer.config.json — into the
 * cross-platform `gdlqb-installer` binary (GUI wizard + silent/unattended
 * CLI + uninstaller in one exe). On Linux, Tauri's bundler ALSO runs
 * (--bundles deb,rpm,appimage) alongside gdlqb-installer, since those three
 * formats are natively supported and there's no reason to hand-roll them.
 * Every artifact — gdlqb-installer plus any deb/rpm/AppImage — lands under a
 * platform-named subdirectory of --out (e.g. dist/linux, dist/windows).
 *
 * Usage:
 *   node build.mjs [--skip-app-build] [--debug] [--out <dir>] [--arch <arch>]
 *                  [--target-platform <windows|linux|macos>]
 *
 *   --skip-app-build     Reuse existing target/release artifacts
 *   --debug              Build the installer itself without --release
 *   --out <dir>          Base output directory (default: tools/installer/dist)
 *                         — the actual artifacts land in <dir>/<platform>/
 *   --arch <arch>        Override the detected arch (x86_64 | aarch64) — affects
 *                         only naming/manifest, not what actually gets compiled
 *   --target-platform    Build for an OS other than the host. This is a REAL
 *                         cross-build, not just a rename: Tauri's Linux target
 *                         links against GTK/webkit2gtk, which don't exist on
 *                         Windows. The only supported combo is host=Windows +
 *                         target=linux, which re-invokes this script inside a
 *                         throwaway Docker container (docker/linux-build.Dockerfile)
 *                         with Node/Rust/GTK preinstalled — requires Docker
 *                         Desktop (or another docker CLI) to be running. The
 *                         image is built with --no-cache and removed again
 *                         (docker rmi) once the build finishes, win or lose —
 *                         nothing is left behind. Any other cross-OS combo
 *                         isn't supported.
 *
 * Everything brandable (icon, ToS text, preset settings, component defaults)
 * comes from installer.config.json — no code changes needed to rebrand.
 */

import {
    copyFileSync,
    cpSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync
} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import os from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const desktopDir = join(repoRoot, 'desktop');
const tauriDir = join(desktopDir, 'src-tauri');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => {
    const i = argv.indexOf(f);
    return i >= 0 ? argv[i + 1] : null;
};

const skipAppBuild = has('--skip-app-build');
const debugBuild = has('--debug');
const targetPlatform = val('--target-platform'); // windows | linux | macos | null (= host)

const ok = (m) => console.log(`\x1b[32m✓\x1b[0m ${m}`);
const info = (m) => console.log(`\x1b[36m·\x1b[0m ${m}`);
const warn = (m) => console.log(`\x1b[33m!\x1b[0m ${m}`);
const die = (m) => {
    console.error(`\x1b[31mError:\x1b[0m ${m}`);
    process.exit(1);
};

const platform = process.platform; // win32 | darwin | linux
const arch = val('--arch') ?? (process.arch === 'arm64' ? 'aarch64' : 'x86_64');
const hostPlatformName = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'macos' : 'linux';

// Every build lands under a platform-named subdirectory (dist/windows,
// dist/linux, dist/macos) rather than all dumping into one flat dist/ —
// under the Docker delegation this "just works" without extra plumbing:
// the re-invocation inside the container recomputes hostPlatformName as
// 'linux' on its own.
const outDir = join(resolve(val('--out') ?? join(__dirname, 'dist')), hostPlatformName);

// npm/npx are .cmd shims on Windows — CreateProcess flatly can't launch a
// batch file without cmd.exe involved, `shell:false` isn't an option. But
// passing `shell: true` alongside a separate `args` array is exactly what
// Node's own deprecation warning is about: with shell:true it just joins
// cmd+args into one command line WITHOUT escaping anything, so an argument
// containing a space or shell-special character silently breaks. The fix
// isn't dropping shell:true — it's not combining it with an args array:
// quote each argument ourselves and hand spawnSync one finished string.
const quoteArg = (a) => (/[\s"]/.test(a) ? `"${String(a).replace(/"/g, '\\"')}"` : String(a));

// Not just existsSync: under the Docker delegation below, node_modules is an
// anonymous-volume mount point that Docker creates (empty) before the
// container's first command even runs, so the directory always "exists" —
// only its contents tell you whether a real install happened.
const needsInstall = (dir) => {
    const nodeModules = join(dir, 'node_modules');
    return !existsSync(nodeModules) || readdirSync(nodeModules).length === 0;
};

// ── 0. Cross-OS delegation ─────────────────────────────────────────────────────
//
// --target-platform asks for an OS other than the host. The only combo that's
// actually possible is Windows -> linux, and only by handing the whole build
// off to a real Linux environment: Tauri's Linux target links against
// GTK/webkit2gtk, which simply don't exist on Windows, so there's no amount
// of `rustup target add` that makes a native cross-compile work here. A
// throwaway Docker container gives us that real Linux environment without
// installing anything permanent on the host.
if (targetPlatform && targetPlatform !== hostPlatformName) {
    if (!(platform === 'win32' && targetPlatform === 'linux')) {
        die(`--target-platform ${targetPlatform} is not supported from a ${hostPlatformName} host. ` +
            `Only windows -> linux (via Docker) is supported; build natively on the target OS otherwise.`);
    }

    info('Target is linux on a Windows host — delegating the build to a throwaway Docker container...');
    const dockerCheck = spawnSync('docker', ['version'], {shell: false});
    if (dockerCheck.error || dockerCheck.status !== 0) {
        die('Docker not found or not running. Start Docker Desktop (or another docker CLI/daemon) and try again.');
    }

    const imageTag = `gdlqb-linux-builder:${Date.now()}`;
    const dockerfile = join(__dirname, 'docker', 'linux-build.Dockerfile');

    // Cleanup must run whether the build succeeds, fails, or the image build
    // itself never finishes — nothing from this delegation should outlive it.
    // Also purges the build cache/dangling images left behind by the image
    // build (--no-cache skips reusing cache but BuildKit still records what
    // it produced) — same "leave Docker exactly as it was" intent as rmi'ing
    // the tag itself. This does reach beyond just our image, since neither
    // builder cache nor dangling images are taggable to scope the prune to
    // this run alone.
    let imageBuilt = false;
    const cleanup = () => {
        if (!imageBuilt) return;
        info('Removing the throwaway build image and purging build cache...');
        spawnSync('docker', ['rmi', '-f', imageTag], {stdio: 'inherit', shell: false});
        spawnSync('docker', ['builder', 'prune', '-f'], {stdio: 'inherit', shell: false});
        spawnSync('docker', ['image', 'prune', '-f'], {stdio: 'inherit', shell: false});
    };

    // --no-cache: this image is meant to be fully disposable, not a layer
    // cache reused across runs — every run reinstalls Node/Rust/GTK fresh.
    const buildResult = spawnSync(
        'docker',
        ['build', '--no-cache', '-f', dockerfile, '-t', imageTag, join(__dirname, 'docker')],
        {stdio: 'inherit', shell: false},
    );
    if (buildResult.error || buildResult.status !== 0) die('Docker image build failed.');
    imageBuilt = true;

    // Forward everything except --target-platform (and its value) — the
    // re-invocation inside the container runs on a real linux host, so it
    // takes the normal native-build path with process.platform === 'linux'.
    const forwarded = [];
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--target-platform') {
            i++;
            continue;
        }
        forwarded.push(argv[i]);
    }

    // Anonymous volumes over every node_modules/target dir the build touches:
    // the repo bind-mount is the same checkout used on the Windows host, and
    // reusing its node_modules (Windows-native optional deps, e.g. rollup)
    // or Cargo target dir (Windows PE artifacts) inside a Linux container is
    // exactly the cross-platform mismatch that broke the first run. An
    // anonymous volume shadows the bind-mounted path with empty, container-
    // local storage instead. These live and die with the *container* (not
    // the image), which is why the container itself is only removed below
    // on success — deleting it on failure would throw away the very state
    // (partial node_modules, build logs) you'd want to debug.
    const isolatedPaths = [
        'tools/installer/node_modules',
        'tools/installer/ui/node_modules',
        'tools/installer/target',
        'desktop/node_modules',
        'desktop/src-tauri/target',
    ];

    // No --rm here (deliberately) — see containerName comment below.
    const containerName = `gdlqb-linux-build-${Date.now()}`;

    // This crate graph (Tauri + sqlx + reqwest + rhai + ~30 more) is heavy
    // enough that full-parallel `cargo build --release` can spike well past
    // what a modestly-sized Docker Desktop VM has, and rustc gets SIGKILL'd
    // by the OOM killer rather than failing with a normal compile error.
    // Capping parallel rustc jobs to half the CPU count trades some build
    // time for a much lower peak-memory footprint. This isn't a substitute
    // for giving Docker Desktop enough memory in the first place (Settings ->
    // Resources -> Memory, 8-16GB) — just a hedge against a smaller box.
    const cargoJobs = Math.max(1, Math.floor(os.cpus().length / 2));

    // Forward the updater signing key from the host env, if set — Tauri's own
    // Linux bundler (invoked below for deb/rpm/appimage) signs updater
    // artifacts itself when it sees an `updater.pubkey` in tauri.conf.json,
    // and fails outright ("public key has been found, but no private key")
    // without a matching TAURI_SIGNING_PRIVATE_KEY. docker run does not
    // inherit the host's environment on its own, so this has to be passed
    // through explicitly.
    //
    // process.env alone only sees what the current process inherited from
    // whatever shell/IDE launched it — a persistent user/machine env var set
    // with `setx` (or System Properties) after that shell was opened won't
    // show up there until a fresh shell is started. Fall back to reading the
    // persisted value straight out of the registry so this doesn't silently
    // skip signing just because of session ordering.
    const getPersistedEnv = (key) => {
        for (const scope of ['User', 'Machine']) {
            const r = spawnSync(
                'powershell.exe',
                ['-NoProfile', '-Command', `[Environment]::GetEnvironmentVariable('${key}','${scope}')`],
                {encoding: 'utf8', shell: false},
            );
            const v = r.stdout?.trim();
            if (v) return v;
        }
        return undefined;
    };

    const signingEnv = [];
    const signingKey = process.env.TAURI_SIGNING_PRIVATE_KEY ?? getPersistedEnv('TAURI_SIGNING_PRIVATE_KEY');
    if (signingKey !== undefined) {
        signingEnv.push('-e', `TAURI_SIGNING_PRIVATE_KEY=${signingKey}`);
        // Must be forced *present* (even as ''), not just forwarded-if-set: the
        // inner `tauri build` step below signs updater artifacts itself as soon
        // as it sees the key above, and only prompts interactively for the
        // password when the var is entirely absent from its env — which hangs
        // forever (well, fails with ENXIO reading a nonexistent /dev/tty) in
        // this non-interactive container. An unset var and an empty-string var
        // are not the same thing to it, so `?? ''` here is deliberate.
        const signingPassword = process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD
            ?? getPersistedEnv('TAURI_SIGNING_PRIVATE_KEY_PASSWORD') ?? '';
        signingEnv.push('-e', `TAURI_SIGNING_PRIVATE_KEY_PASSWORD=${signingPassword}`);
    }

    // Mount the whole repo (not just tools/installer): the script also reads
    // desktop/src-tauri and runs cargo/npm builds rooted there. --out stays
    // under tools/installer/dist by default, which is inside the mount, so
    // artifacts land directly on the host filesystem — no copy-out step.
    const runResult = spawnSync(
        'docker',
        [
            'run', '--name', containerName,
            '-e', `CARGO_BUILD_JOBS=${cargoJobs}`,
            ...signingEnv,
            '-v', `${repoRoot}:/workspace`,
            ...isolatedPaths.flatMap((p) => ['-v', `/workspace/${p}`]),
            '-w', '/workspace/tools/installer',
            imageTag,
            'node', 'build.mjs', ...forwarded,
        ],
        {stdio: 'inherit', shell: false},
    );

    if (runResult.status === 0) {
        info('Removing the build container...');
        spawnSync('docker', ['rm', '-f', containerName], {stdio: 'inherit', shell: false});
        cleanup();
    } else {
        warn(`Build failed — leaving container "${containerName}" (and image ${imageTag}) in place for debugging.\n` +
            `  Inspect it:  docker start ${containerName} && docker exec -it ${containerName} sh\n` +
            `  Clean up when done:  docker rm -f ${containerName} && docker rmi -f ${imageTag}`);
    }
    process.exit(runResult.status ?? 1);
}

function run(cmd, args, opts = {}) {
    const attempt = () => {
        info(`$ ${cmd} ${args.join(' ')}`);
        const useShell = platform === 'win32' && opts.shell !== false;
        return useShell
            ? spawnSync([cmd, ...args].map(quoteArg).join(' '), {stdio: 'inherit', ...opts, shell: true})
            : spawnSync(cmd, args, {stdio: 'inherit', shell: false, ...opts});
    };
    let r = attempt();
    // npm has a longstanding class of bugs where a node_modules built for a
    // different platform/lockfile state makes it resolve the wrong optional
    // dependency (https://github.com/npm/cli/issues/4828) — most visible here
    // when the same repo checkout gets built on more than one OS (e.g. the
    // Docker Linux cross-build below). npm's own fix is "remove node_modules
    // and reinstall"; do that once for any failing `npm install`/`npm ci`.
    //
    // Deliberately scoped to install/ci only: retrying is only valid because
    // the command we're retrying (install) is the thing that regenerates
    // node_modules. Anything else here — `npm run tauri -- build`, etc. —
    // fails for its own reason; wiping node_modules and rerunning that same
    // command wouldn't fix it, it'd just also break "tauri: not found" on
    // top, burying the real error under a fake one.
    const isInstallCmd = args[0] === 'install' || args[0] === 'ci';
    if (r.status !== 0 && cmd === 'npm' && isInstallCmd && opts.cwd) {
        const nodeModules = join(opts.cwd, 'node_modules');
        if (existsSync(nodeModules)) {
            warn(`npm failed in ${opts.cwd} — clearing node_modules and retrying once`);
            // Empty the directory rather than rmdir-ing it: under the Docker
            // delegation this path is an anonymous-volume mount point, and
            // removing the mount point itself fails with EBUSY.
            for (const entry of readdirSync(nodeModules)) {
                rmSync(join(nodeModules, entry), {recursive: true, force: true});
            }
            r = attempt();
        }
    }
    if (r.status !== 0) die(`${cmd} exited with code ${r.status}`);
}

// ── 1. Read configs ───────────────────────────────────────────────────────────

const tauriConf = JSON.parse(readFileSync(join(tauriDir, 'tauri.conf.json'), 'utf8'));
const instConf = JSON.parse(readFileSync(join(__dirname, 'installer.config.json'), 'utf8'));

const productName = tauriConf.productName;
const version = tauriConf.version;
const identifier = tauriConf.identifier;
const publisher = tauriConf.bundle?.publisher ?? '';
const slug = productName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

console.log(`\n\x1b[1m${productName} v${version} — custom installer build (${platform}-${arch})\x1b[0m\n`);

// ── 2. Build the wizard UI (Vite + React + Tailwind, shared design tokens) ────

const uiDir = join(__dirname, 'ui');
if (needsInstall(uiDir)) {
    run('npm', ['install'], {cwd: uiDir});
}
run('npm', ['run', 'build'], {cwd: uiDir});
ok('Wizard UI built');

// Stage the configured icons where tauri.conf.json expects them (tauri-build
// embeds icons/icon.ico as the exe icon on Windows).
mkdirSync(join(__dirname, 'icons'), {recursive: true});
copyFileSync(resolve(__dirname, instConf.iconIco), join(__dirname, 'icons', 'icon.ico'));
copyFileSync(resolve(__dirname, instConf.iconPng), join(__dirname, 'icons', 'icon.png'));

// ── 3. Build the app ────────────────────────────────────────────────────────
//
// Windows/macOS: --no-bundle (macOS: --bundles app for a launchable .app) —
// our installer is the only packaging there, same as ever. Linux additionally
// asks Tauri's own bundler for deb/rpm/AppImage: those three are natively
// supported bundle targets (unlike Flatpak/Snap, which aren't Tauri bundler
// targets at all and need their own separate tooling), so there's no reason
// to hand-roll them — Tauri already knows how. This runs alongside, not
// instead of, our custom `gdlqb-installer` payload below; cargo always
// produces the raw executable regardless of which --bundles are requested.

if (!skipAppBuild) {
    if (needsInstall(desktopDir)) {
        run('npm', ['install'], {cwd: desktopDir});
    }
    const bundleArgs =
        platform === 'darwin' ? ['--bundles', 'app'] :
            platform === 'linux' ? ['--bundles', 'deb,rpm,appimage'] :
                ['--no-bundle'];
    run('npm', ['run', 'tauri', '--', 'build', ...bundleArgs], {cwd: desktopDir});
} else {
    info('Skipping app build (--skip-app-build)');
}

const release = join(tauriDir, 'target', 'release');

// Collect Tauri's own Linux bundles (deb/rpm/AppImage) alongside our custom
// installer output — always attempted (even with --skip-app-build) so a
// prior run's bundle/ dir still gets picked up.
if (platform === 'linux') {
    const bundleDir = join(release, 'bundle');
    mkdirSync(outDir, {recursive: true});
    for (const kind of ['deb', 'rpm', 'appimage']) {
        const kindDir = join(bundleDir, kind);
        if (!existsSync(kindDir)) continue;
        for (const file of readdirSync(kindDir)) {
            const src = join(kindDir, file);
            // deb in particular leaves its intermediate package tree (DEBIAN/,
            // usr/, ...) sitting alongside the actual .deb as a same-named
            // directory — only the files (the real .deb/.rpm/.AppImage) are
            // wanted here.
            if (!statSync(src).isFile()) continue;
            copyFileSync(src, join(outDir, file));
        }
    }
    ok('Collected deb/rpm/AppImage bundles');
}

// ── 4. Stage the payload tree ─────────────────────────────────────────────────

// On Linux (including inside the Docker delegation above), stage under a
// real container-local temp dir rather than __dirname. __dirname sits inside
// the /workspace bind mount shared from the Windows host, and Docker
// Desktop's Windows<->Linux file-sharing layer has known mtime/listing
// consistency lag on bind mounts — writing this tree and reading it back
// (via tar) moments later intermittently surfaces as "file changed as we
// read it" or a file/directory that briefly appears missing. A real tmpfs-
// backed temp dir has no such lag. Windows/macOS builds are unaffected and
// keep staging under __dirname as before.
const stageRoot = platform === 'linux' ? mkdtempSync(join(os.tmpdir(), 'gdlqb-stage-')) : __dirname;
const stage = join(stageRoot, '.stage');
rmSync(stage, {recursive: true, force: true});
mkdirSync(join(stage, 'app'), {recursive: true});

const exeName =
    platform === 'win32' ? 'gdlqbot.exe' :
        platform === 'darwin' ? `${productName}.app` :
            'gdlqbot';

if (platform === 'darwin') {
    const appBundle = join(release, 'bundle', 'macos', `${productName}.app`);
    if (!existsSync(appBundle)) die(`Missing ${appBundle} — did the Tauri build run?`);
    cpSync(appBundle, join(stage, 'app', exeName), {recursive: true});
} else {
    const exe = join(release, exeName);
    if (!existsSync(exe)) die(`Missing ${exe} — did the Tauri build run?`);
    copyFileSync(exe, join(stage, 'app', exeName));
}
ok(`Staged app (${exeName})`);

// CLI sidecar (built by beforeBuildCommand: cargo build -p gdlqbot-cli)
const cliName = platform === 'win32' ? 'gdlqbcli.exe' : 'gdlqbcli';
let cliStaged = false;
for (const candidate of [
    join(release, cliName),
    join(tauriDir, 'binaries', platform === 'win32' ? `gdlqbcli-x86_64-pc-windows-msvc.exe` : `gdlqbcli-${arch}-unknown-linux-gnu`),
]) {
    if (existsSync(candidate)) {
        mkdirSync(join(stage, 'cli'), {recursive: true});
        copyFileSync(candidate, join(stage, 'cli', cliName));
        cliStaged = true;
        break;
    }
}
if (cliStaged) ok(`Staged CLI (${cliName})`); else info('CLI binary not found — installer will omit the CLI component');

// ── 5. Pack payload.tar.gz (system tar: bsdtar on Win10+, GNU/BSD elsewhere) ──

const payload = join(stageRoot, '.stage-payload.tar.gz');
rmSync(payload, {force: true});
const tarMembers = cliStaged ? ['app', 'cli'] : ['app'];
// Relative paths + cwd: GNU tar (git-bash) treats "C:\…" as a remote host —
// only a concern on Windows, where stageRoot is still __dirname; on Linux
// stageRoot has no drive-letter colon to misparse, but the relative-path
// form works identically there so there's no need to branch on it.
run('tar', ['-czf', '.stage-payload.tar.gz', '-C', '.stage', ...tarMembers], {shell: false, cwd: stageRoot});
ok(`Payload packed (${(statSync(payload).size / 1024 / 1024).toFixed(1)} MB)`);

// ── 6. Generate the embedded manifest ─────────────────────────────────────────

// File associations: everything Tauri declares (.gdlqs) plus extras from
// installer.config.json (.gdui, .rhai, …).
const fileAssociations = [];
for (const fa of tauriConf.bundle?.fileAssociations ?? []) {
    for (const ext of fa.ext) {
        fileAssociations.push({ext, prog_id: fa.name, description: fa.description ?? fa.name});
    }
}
for (const fa of instConf.fileAssociations ?? []) {
    const progId = fa.progId ?? fa.prog_id; // tolerate either casing in the config
    if (!progId) die(`fileAssociations entry for .${fa.ext} is missing progId`);
    fileAssociations.push({ext: fa.ext, prog_id: progId, description: fa.description});
}

const manifest = {
    product_name: productName,
    identifier,
    version,
    publisher,
    homepage: instConf.homepage ?? '',
    exe_name: exeName,
    cli_name: cliStaged ? cliName : null,
    license: readFileSync(resolve(__dirname, instConf.licenseFile), 'utf8'),
    file_associations: fileAssociations,
    defaults: instConf.defaults ?? {},
    offers: instConf.offers ?? [],
    preset: instConf.preset ?? {},
    // Verified by the installer's validation phase before extraction.
    payload_sha256: createHash('sha256').update(readFileSync(payload)).digest('hex'),
};
const manifestPath = join(stageRoot, '.stage-manifest.json');
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
ok('Manifest generated');

// ── 7. Compile the installer with everything embedded ─────────────────────────

const env = {
    ...process.env,
    GDLQB_PAYLOAD: payload,
    GDLQB_MANIFEST: manifestPath,
    GDLQB_ICON_PNG: resolve(__dirname, instConf.iconPng),
};

// --features custom-protocol: serve the embedded UI, never devUrl. This is
// what `tauri build` would enable; we drive cargo directly so we set it.
const cargoArgs = ['build', '--features', 'custom-protocol', ...(debugBuild ? [] : ['--release'])];
run('cargo', cargoArgs, {cwd: __dirname, env, shell: false});

// ── 8. Collect the output ─────────────────────────────────────────────────────

const profile = debugBuild ? 'debug' : 'release';
const builtName = platform === 'win32' ? 'gdlqb-installer.exe' : 'gdlqb-installer';
const built = join(__dirname, 'target', profile, builtName);
if (!existsSync(built)) die(`Expected installer at ${built}`);

mkdirSync(outDir, {recursive: true});
const finalName = platform === 'win32'
    ? `${slug}-setup-v${version}-windows-${arch}.exe`
    : `${slug}-setup-v${version}-${platform === 'darwin' ? 'macos' : 'linux'}-${arch}`;
const finalPath = join(outDir, finalName);
rmSync(finalPath, {force: true}); // clear stale (possibly locked) output first

if (platform === 'linux') {
    // gdlqb-installer is itself a Tauri/WebKitGTK app (it embeds the wizard
    // UI), so it needs libwebkit2gtk-4.1 on the machine just to start —
    // before any of our own Rust code runs, since this is a dynamic-linker
    // failure at process startup, not something we can catch. Unlike the
    // .deb/.rpm (which declare this as a package dependency) or the
    // .AppImage (which bundles GTK/webkit in via linuxdeploy-plugin-gtk),
    // this bare ELF bypasses a package manager entirely and would otherwise
    // fail with a raw, unhelpful "error while loading shared libraries" on
    // any machine that's never had a Tauri app installed before.
    //
    // Fixed by making the distributed file a small self-extracting shell
    // script (classic makeself-style: a text header followed by the real
    // ELF bytes appended after it) that checks for the library first and
    // prints an actionable install command, extracting-and-exec'ing the
    // real binary only once the check passes. This stays a single file —
    // important because release.mjs registers exactly one URL + .sig per
    // platform for the app's own silent self-updater to fetch and verify.
    // That self-update path is unaffected by the added check: a machine
    // capable of running the updater already has the app (and therefore
    // libwebkit2gtk) installed, so the preflight always passes there —
    // this only ever actually triggers on a genuinely fresh machine doing
    // a first manual install, exactly what caught this in testing.
    const OFFSET_WIDTH = 10;
    const headerTemplate = `#!/usr/bin/env bash
set -e
# A plain user's PATH doesn't always include /sbin (where ldconfig usually
# lives) — try the common absolute locations before giving up on it.
LDCONFIG=$(command -v ldconfig 2>/dev/null || echo /sbin/ldconfig)
HAS_WEBKIT=0
if [ -x "$LDCONFIG" ] && "$LDCONFIG" -p 2>/dev/null | grep -q 'libwebkit2gtk-4\\.1\\.so'; then
  HAS_WEBKIT=1
else
  for d in /usr/lib/x86_64-linux-gnu /usr/lib/aarch64-linux-gnu /usr/lib64 /usr/lib /usr/local/lib; do
    if ls "$d"/libwebkit2gtk-4.1.so* >/dev/null 2>&1; then HAS_WEBKIT=1; break; fi
  done
fi
if [ "$HAS_WEBKIT" != "1" ]; then
  echo "GD Level Request Bot needs libwebkit2gtk-4.1 to run." >&2
  if command -v apt-get >/dev/null 2>&1; then
    echo "Install it with:  sudo apt install libwebkit2gtk-4.1-0" >&2
  elif command -v dnf >/dev/null 2>&1; then
    echo "Install it with:  sudo dnf install webkit2gtk4.1" >&2
  elif command -v zypper >/dev/null 2>&1; then
    echo "Install it with:  sudo zypper install libwebkit2gtk-4_1-0" >&2
  elif command -v pacman >/dev/null 2>&1; then
    echo "Install it with:  sudo pacman -S webkit2gtk-4.1" >&2
  fi
  exit 1
fi
OFFSET=${'0'.repeat(OFFSET_WIDTH)}
TMP="$(mktemp "\${TMPDIR:-/tmp}/gdlqb-installer.XXXXXX")"
# 10#$OFFSET forces base-10: bash's $(()) otherwise treats a leading-zero
# literal as octal, which breaks outright on an offset containing an 8 or 9.
tail -c +"$((10#$OFFSET))" "$0" > "$TMP"
chmod +x "$TMP"
exec "$TMP" "$@"
`;
    // Fixed-width placeholder means substituting the real value can't change
    // the header's byte length, so this needs no back-patch/iteration —
    // headerLen computed from the placeholder text is already final.
    const headerLen = Buffer.byteLength(headerTemplate, 'utf8');
    const offset = headerLen + 1; // tail -c +N is 1-indexed
    const offsetStr = String(offset).padStart(OFFSET_WIDTH, '0');
    if (offsetStr.length !== OFFSET_WIDTH) die(`Installer too large for ${OFFSET_WIDTH}-digit offset placeholder`);
    const header = headerTemplate.replace('0'.repeat(OFFSET_WIDTH), offsetStr);

    writeFileSync(finalPath, Buffer.concat([Buffer.from(header, 'utf8'), readFileSync(built)]));
    spawnSync('chmod', ['+x', finalPath]);
} else {
    copyFileSync(built, finalPath);
    if (platform !== 'win32') spawnSync('chmod', ['+x', finalPath]);
}

rmSync(stage, {recursive: true, force: true});

ok(`Installer ready: ${finalPath} (${(statSync(finalPath).size / 1024 / 1024).toFixed(1)} MB)`);

// ── 9. Sign for tauri-plugin-updater ───────────────────────────────────────────
//
// The updater plugin verifies a minisign signature against the pubkey in
// tauri.conf.json (plugins.updater.pubkey) before it will run *anything* —
// it doesn't care what produced the file, only that the signature is valid.
// `tauri build`'s own bundlers get one for free via createUpdaterArtifacts;
// since we build with --no-bundle, nobody signs our exe unless we do it here.
// Requires TAURI_SIGNING_PRIVATE_KEY (+ optionally _PASSWORD) in the env —
// the same private key that corresponds to the configured pubkey. Without
// it we skip signing (fine for local/dev builds; release builds need it).
const sigPath = `${finalPath}.sig`;
rmSync(sigPath, {force: true});
if (process.env.TAURI_SIGNING_PRIVATE_KEY) {
    if (needsInstall(__dirname)) {
        run('npm', ['install'], {cwd: __dirname});
    }
    // Force TAURI_SIGNING_PRIVATE_KEY_PASSWORD to be *present* in the child
    // env (empty string if the key has no password): the CLI only prompts
    // interactively when the var is entirely absent, which hangs forever in
    // a non-TTY build. Env var, not a CLI arg — avoids shell-quoting an
    // empty string through cmd.exe on Windows.
    const signEnv = {
        ...process.env,
        TAURI_SIGNING_PRIVATE_KEY_PASSWORD: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? '',
    };
    // Same reasoning as run()'s useShell branch: npx needs cmd.exe on
    // Windows, but shell:true + a separate args array is the unescaped
    // combination Node warns about — quote everything into one string first.
    const signArgs = ['npx', 'tauri', 'signer', 'sign', finalPath];
    const signResult = platform === 'win32'
        ? spawnSync(signArgs.map(quoteArg).join(' '), {stdio: 'inherit', shell: true, cwd: __dirname, env: signEnv})
        : spawnSync('npx', signArgs.slice(1), {stdio: 'inherit', shell: false, cwd: __dirname, env: signEnv});
    if (signResult.status === 0 && existsSync(sigPath)) {
        ok('Signed for the updater');
    } else {
        warn('Signing failed — installer built but NOT signed; the updater will refuse it. ' +
            'Check TAURI_SIGNING_PRIVATE_KEY_PASSWORD.');
    }
} else {
    info('TAURI_SIGNING_PRIVATE_KEY not set — skipping updater signature (unsigned builds cannot be auto-updated to)');
}

const platformKey = platform === 'win32'
    ? `windows-${arch}`
    : platform === 'darwin' ? `darwin-${arch}` : `linux-${arch}`;
console.log(`
  Interactive:   ${finalName}
  Unattended:    ${finalName} --unattended
  Silent:        ${finalName} --silent --accept-license [--with-cli] [--enable-dev]
  Uninstall:     ${finalName} --uninstall [--silent] [--purge]
  All options:   ${finalName} --help
${existsSync(sigPath) ? `
  Updater platform key: ${platformKey}
  Register with tools/release/release.mjs, or manually:
    --asset ${platformKey} <hosted-url> ${sigPath}
` : ''}`);
