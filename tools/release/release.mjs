#!/usr/bin/env node
/**
 * GD Level Request Bot — Tauri release publisher
 *
 * Discovers build artifacts, reads their .sig files, and registers the release
 * with the update server's admin API.
 *
 * Requires Node 18+ (built-in fetch, fs/promises). Zero runtime dependencies.
 *
 * Usage:
 *   node release.mjs [options]
 *
 * Quick start:
 *   1. Copy release.config.example.json → release.config.json and fill it in
 *      (bundleDir should point at tools/installer/dist).
 *   2. Set TAURI_SIGNING_PRIVATE_KEY (+ _PASSWORD if the key has one) and run
 *      `node tools/installer/build.mjs` — it signs the installer it produces.
 *   3. Upload the installer + its .sig to your hosting (see assetsBaseUrl).
 *   4. node release.mjs --notes "Bug fixes" --publish
 */

import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Terminal colours (disabled when not a TTY) ────────────────────────────────

const isTTY = process.stdout.isTTY;
const c = {
    reset: isTTY ? '\x1b[0m' : '',
    bold: isTTY ? '\x1b[1m' : '',
    red: isTTY ? '\x1b[31m' : '',
    green: isTTY ? '\x1b[32m' : '',
    yellow: isTTY ? '\x1b[33m' : '',
    cyan: isTTY ? '\x1b[36m' : '',
    magenta: isTTY ? '\x1b[35m' : '',
    dim: isTTY ? '\x1b[2m' : '',
};

const ok = (msg) => console.log(`${c.green}✓${c.reset} ${msg}`);
const info = (msg) => console.log(`${c.cyan}·${c.reset} ${msg}`);
const warn = (msg) => console.log(`${c.yellow}!${c.reset} ${msg}`);
const die = (msg) => {
    console.error(`${c.red}Error:${c.reset} ${msg}`);
    process.exit(1);
};
const head = (msg) => console.log(`\n${c.bold}${msg}${c.reset}`);

// ── CLI argument parser ───────────────────────────────────────────────────────

function parseArgs(argv) {
    const opts = {
        version: null,
        notes: null,
        notesFile: null,
        baseUrl: null,
        assets: [],   // [{platform, url, sigSrc}]  sigSrc = path or raw content
        publish: false,
        dryRun: false,
        configPath: join(__dirname, 'release.config.json'),
        // Actions (mutually exclusive with create)
        list: false,
        deleteId: null,
        publishId: null,
        unpublishId: null,
        showHelp: false,
    };

    const args = argv.slice(2);
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        const next = () => {
            if (i + 1 >= args.length) die(`${a} requires an argument`);
            return args[++i];
        };
        switch (a) {
            case '--help':
            case '-h':
                opts.showHelp = true;
                break;
            case '--list':
                opts.list = true;
                break;
            case '--publish':
                opts.publish = true;
                break;
            case '--dry-run':
                opts.dryRun = true;
                break;
            case '--version':
                opts.version = next();
                break;
            case '--notes':
                opts.notes = next();
                break;
            case '--notes-file':
                opts.notesFile = next();
                break;
            case '--base-url':
                opts.baseUrl = next();
                break;
            case '--config':
                opts.configPath = next();
                break;
            case '--delete':
                opts.deleteId = parseInt(next(), 10);
                break;
            case '--publish-id':
                opts.publishId = parseInt(next(), 10);
                break;
            case '--unpublish':
                opts.unpublishId = parseInt(next(), 10);
                break;
            case '--asset': {
                // --asset <platform> <url> <sig-file-or-raw>
                const platform = next();
                const url = next();
                const sigSrc = next();
                opts.assets.push({platform, url, sigSrc});
                break;
            }
            default:
                die(`Unknown argument: ${a}\nRun with --help for usage.`);
        }
    }
    return opts;
}

const HELP = `
${c.bold}GD Level Request Bot — Release Publisher${c.reset}

${c.dim}Usage:${c.reset}
  node release.mjs [options]

${c.dim}Release options:${c.reset}
  --version <v>              App version (auto-read from tauri.conf.json if omitted)
  --notes <text>             Release notes (Markdown)
  --notes-file <path>        Read release notes from a file
  --base-url <url>           Base URL where installers are hosted.
                             Installer filenames are appended automatically.
  --asset <plat> <url> <sig> Manually add a platform asset.
                             <sig> can be a .sig file path or the raw content.
                             Can be repeated.
  --publish                  Publish the release immediately after creating it.
  --dry-run                  Print what would happen; do not call the API.

${c.dim}Management:${c.reset}
  --list                     List all releases on the server.
  --publish-id <id>          Publish a specific release by ID.
  --unpublish <id>           Unpublish a specific release by ID.
  --delete <id>              Delete a release and all its assets.

${c.dim}Other:${c.reset}
  --config <path>            Config file path (default: release.config.json)
  --help                     Show this help.

${c.dim}Typical workflow:${c.reset}
  1. cd desktop && npm run tauri build
  2. Upload the installer to your CDN / hosting.
  3. node release.mjs --notes "Bug fixes" --publish
`;

// ── Config ────────────────────────────────────────────────────────────────────

function loadConfig(path) {
    const abs = resolve(path);
    if (!existsSync(abs)) {
        die(
            `Config file not found: ${abs}\n` +
            `  Copy ${join(__dirname, 'release.config.example.json')} → ${abs}\n` +
            `  and fill in your server URL, admin key, and asset base URL.`
        );
    }
    const raw = JSON.parse(readFileSync(abs, 'utf8'));

    // Validate required fields
    const required = ['server', 'adminKey'];
    for (const k of required) {
        if (!raw[k]) die(`Config is missing required field: "${k}"`);
    }
    return raw;
}

// ── Artifact discovery ────────────────────────────────────────────────────────
//
// Our own installer (tools/installer/build.mjs), not Tauri's bundlers —
// bundling is disabled (`tauri build --no-bundle`) and build.mjs signs the
// output itself (needs TAURI_SIGNING_PRIVATE_KEY), writing a flat dist/ dir:
//   {slug}-setup-v{version}-windows-{arch}.exe            + .exe.sig
//   {slug}-setup-v{version}-macos-{arch}                  + .sig
//   {slug}-setup-v{version}-linux-{arch}                  + .sig
//
// Platform strings expected by tauri-plugin-updater v2:
//   "windows-x86_64", "windows-aarch64", "linux-x86_64", "linux-aarch64",
//   "darwin-x86_64", "darwin-aarch64"

const ARTIFACT_PATTERNS = [
    {re: /-windows-x86_64\.exe\.sig$/i, platform: 'windows-x86_64'},
    {re: /-windows-aarch64\.exe\.sig$/i, platform: 'windows-aarch64'},
    {re: /-macos-x86_64\.sig$/i, platform: 'darwin-x86_64'},
    {re: /-macos-aarch64\.sig$/i, platform: 'darwin-aarch64'},
    {re: /-linux-x86_64\.sig$/i, platform: 'linux-x86_64'},
    {re: /-linux-aarch64\.sig$/i, platform: 'linux-aarch64'},
];

function discoverArtifacts(bundleDir, baseUrl) {
    const distAbs = resolve(bundleDir);
    if (!existsSync(distAbs)) {
        die(
            `Installer output directory not found: ${distAbs}\n` +
            `  Run \`node tools/installer/build.mjs\` first (needs TAURI_SIGNING_PRIVATE_KEY to produce a .sig).`
        );
    }

    const candidates = {};   // platform → info

    for (const file of readdirSync(distAbs)) {
        for (const {re, platform} of ARTIFACT_PATTERNS) {
            if (!re.test(file)) continue;

            const sigPath = join(distAbs, file);
            const installerName = file.slice(0, -4); // strip .sig
            const installerPath = join(distAbs, installerName);

            if (!existsSync(installerPath)) {
                warn(`Sig found but installer missing: ${installerPath}`);
                continue;
            }

            candidates[platform] = {
                platform,
                installerName,
                installerPath,
                sigPath,
                sig: readFileSync(sigPath, 'utf8').trim(),
                url: baseUrl
                    ? `${baseUrl.replace(/\/$/, '')}/${installerName}`
                    : null,
            };
        }
    }

    return Object.values(candidates);
}

// ── API client ────────────────────────────────────────────────────────────────

function makeClient(server, adminKey) {
    const base = server.replace(/\/$/, '');
    const headers = {
        'Content-Type': 'application/json',
        'X-Admin-Key': adminKey,
    };

    const req = async (method, path, body) => {
        let res;
        try {
            res = await fetch(`${base}${path}`, {
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined,
            });
        } catch (e) {
            die(`Network error calling ${method} ${base}${path}: ${e.message}`);
        }

        const text = await res.text();
        let json;
        try {
            json = JSON.parse(text);
        } catch {
            json = {raw: text};
        }

        if (!res.ok) {
            throw new ApiError(res.status, method, path, json);
        }
        return json;
    };

    return {
        listAll: () => req('GET', '/admin/releases'),
        create: (body) => req('POST', '/admin/release', body),
        addAsset: (id, body) => req('POST', `/admin/release/${id}/asset`, body),
        publish: (id) => req('POST', `/admin/release/${id}/publish`),
        unpublish: (id) => req('POST', `/admin/release/${id}/unpublish`),
        delete: (id) => req('DELETE', `/admin/release/${id}`),
    };
}

class ApiError extends Error {
    constructor(status, method, path, body) {
        const detail = body?.error || body?.raw || JSON.stringify(body);
        super(`${method} ${path} → HTTP ${status}: ${detail}`);
        this.status = status;
    }
}

// ── List formatter ────────────────────────────────────────────────────────────

function printReleaseTable(releases) {
    if (!releases.length) {
        info('No releases found.');
        return;
    }
    const COL = {id: 4, ver: 9, pub: 9, date: 20, platforms: 0};
    const row = (id, ver, pub, date, plat) =>
        `  ${String(id).padEnd(COL.id)}${String(ver).padEnd(COL.ver)}${String(pub).padEnd(COL.pub)}${String(date).padEnd(COL.date)}${plat}`;

    console.log(row('ID', 'Version', 'Published', 'Date', 'Platforms'));
    console.log('  ' + '─'.repeat(62));
    for (const r of releases) {
        const pub = r.is_published
            ? `${c.green}yes${c.reset}      `
            : `${c.yellow}no${c.reset}       `;
        const date = (r.pub_date || r.created_at || '').replace('T', ' ').slice(0, 19);
        const plat = (r.platforms || []).join(', ') || c.dim + 'none' + c.reset;
        console.log(row(r.id, r.version, pub, date, plat));
    }
}

// ── Resolve sig source ────────────────────────────────────────────────────────

function resolveSig(sigSrc) {
    // If it looks like a file path and the file exists, read it
    const abs = resolve(sigSrc);
    if (existsSync(abs)) {
        return readFileSync(abs, 'utf8').trim();
    }
    // Otherwise treat it as raw content
    return sigSrc.trim();
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
    const opts = parseArgs(process.argv);

    if (opts.showHelp) {
        console.log(HELP);
        return;
    }

    const cfg = loadConfig(opts.configPath);
    const api = makeClient(cfg.server, cfg.adminKey);

    // ── --list ────────────────────────────────────────────────────────────────
    if (opts.list) {
        head('Releases');
        const {releases} = await api.listAll();
        printReleaseTable(releases);
        console.log();
        return;
    }

    // ── --publish-id ──────────────────────────────────────────────────────────
    if (opts.publishId !== null) {
        await api.publish(opts.publishId);
        ok(`Published release #${opts.publishId}`);
        return;
    }

    // ── --unpublish ───────────────────────────────────────────────────────────
    if (opts.unpublishId !== null) {
        await api.unpublish(opts.unpublishId);
        ok(`Unpublished release #${opts.unpublishId}`);
        return;
    }

    // ── --delete ──────────────────────────────────────────────────────────────
    if (opts.deleteId !== null) {
        const res = await api.delete(opts.deleteId);
        if (res.deleted) ok(`Deleted release #${opts.deleteId}`);
        else warn(`Release #${opts.deleteId} not found`);
        return;
    }

    // ── Create / update a release ─────────────────────────────────────────────

    // 1. Version
    const tauriConfPath = cfg.tauriConf
        ? resolve(__dirname, cfg.tauriConf)
        : null;
    const tauriConf = tauriConfPath && existsSync(tauriConfPath)
        ? JSON.parse(readFileSync(tauriConfPath, 'utf8'))
        : null;

    const version = opts.version
        ?? tauriConf?.version
        ?? die('Cannot determine version. Pass --version or set tauriConf in config.');

    // 2. Release notes
    let notes = opts.notes ?? '';
    if (opts.notesFile) {
        notes = await readFile(resolve(opts.notesFile), 'utf8');
    }
    if (!notes.trim()) warn('No release notes (use --notes or --notes-file).');

    // 3. Assets — CLI overrides auto-discovery
    const baseUrl = opts.baseUrl ?? cfg.assetsBaseUrl ?? null;
    let assets;

    if (opts.assets.length > 0) {
        // Manually specified
        assets = opts.assets.map(({platform, url, sigSrc}) => ({
            platform,
            url,
            signature: resolveSig(sigSrc),
        }));
    } else {
        // Auto-discover from bundle dir
        if (!cfg.bundleDir) {
            die('No assets specified and bundleDir is not set in config. Pass --asset or set bundleDir.');
        }
        const discovered = discoverArtifacts(cfg.bundleDir, baseUrl);
        if (!discovered.length) {
            die('No build artifacts found. Did you run `npm run tauri build`?');
        }
        for (const a of discovered) {
            if (!a.url) {
                die(
                    `No URL for platform ${a.platform}.\n` +
                    `  Pass --base-url <url> or set assetsBaseUrl in config.\n` +
                    `  Expected URL: <base>/${a.installerName}`
                );
            }
        }
        assets = discovered.map(({platform, url, sig}) => ({platform, url, signature: sig}));
    }

    // ── Dry run ───────────────────────────────────────────────────────────────
    if (opts.dryRun) {
        head(`Dry run — v${version}`);
        info(`Server:  ${cfg.server}`);
        info(`Publish: ${opts.publish}`);
        if (notes) info(`Notes:\n${notes}`);
        head('Assets');
        for (const a of assets) {
            info(`  ${a.platform.padEnd(18)} → ${a.url}`);
            info(`  ${''.padEnd(18)}   sig: ${a.signature.slice(0, 40)}…`);
        }
        console.log(`\n${c.magenta}Dry run complete — nothing was sent.${c.reset}\n`);
        return;
    }

    // ── Create release ────────────────────────────────────────────────────────
    head(`Publishing v${version}`);
    info(`Server: ${cfg.server}`);

    let releaseId;
    try {
        const res = await api.create({
            version: version.replace(/^v/, ''),
            notes,
            pub_date: new Date().toISOString(),
        });
        releaseId = res.id;
        ok(`Created release #${releaseId}`);
    } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
            // Already exists — look up its ID
            warn(`Release v${version} already exists on server, appending assets…`);
            const {releases} = await api.listAll();
            const existing = releases.find(r => r.version === version.replace(/^v/, ''));
            if (!existing) die('Release exists (409) but could not find it in the list.');
            releaseId = existing.id;
        } else {
            throw e;
        }
    }

    // ── Add assets ────────────────────────────────────────────────────────────
    for (const {platform, url, signature} of assets) {
        info(`Adding ${platform} → ${url}`);
        await api.addAsset(releaseId, {platform, url, signature});
        ok(`  ${platform}`);
    }

    // ── Publish ───────────────────────────────────────────────────────────────
    if (opts.publish) {
        await api.publish(releaseId);
        ok(`\nPublished! v${version} is now live.`);
    } else {
        info(`\nRelease #${releaseId} created but ${c.yellow}not published${c.reset}.`);
        info(`Publish it when ready:`);
        info(`  node release.mjs --publish-id ${releaseId}`);
        info(`  — or —`);
        info(`  node release.mjs --list`);
    }
    console.log();
}

main().catch((e) => {
    if (e instanceof ApiError) {
        die(e.message);
    }
    console.error(e);
    process.exit(1);
});
