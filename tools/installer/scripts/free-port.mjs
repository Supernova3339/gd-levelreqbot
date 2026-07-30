#!/usr/bin/env node
/**
 * Kill whatever is listening on the given TCP port (default: 1430, the
 * installer UI's fixed vite port). Used as `predev` so a crashed or orphaned
 * vite from a previous session never blocks `npm run dev` (strictPort: true).
 */
import {execSync} from 'node:child_process';

const port = Number(process.argv[2] ?? 1430);
if (!Number.isInteger(port) || port <= 0) {
    console.error(`free-port: invalid port ${process.argv[2]}`);
    process.exit(1);
}

const sh = (cmd) => execSync(cmd, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']});

try {
    if (process.platform === 'win32') {
        // No `-p tcp` — that hides IPv6 listeners ("[::1]:1430"). Plain -ano
        // labels both stacks "TCP":
        //   "  TCP    0.0.0.0:1430   0.0.0.0:0   LISTENING   12345"
        //   "  TCP    [::1]:1430     [::]:0      LISTENING   12345"
        const out = sh('netstat -ano');
        const pids = new Set();
        for (const line of out.split(/\r?\n/)) {
            const m = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/);
            if (m && Number(m[1]) === port) pids.add(m[2]);
        }
        for (const pid of pids) {
            try {
                sh(`taskkill /F /PID ${pid}`);
                console.log(`free-port: killed pid ${pid} holding :${port}`);
            } catch { /* already gone */
            }
        }
    } else {
        const pids = sh(`lsof -ti tcp:${port} -s tcp:listen`).trim().split(/\s+/).filter(Boolean);
        for (const pid of pids) {
            try {
                sh(`kill -9 ${pid}`);
                console.log(`free-port: killed pid ${pid} holding :${port}`);
            } catch { /* already gone */
            }
        }
    }
} catch {
    // netstat/lsof found nothing — port is already free
}
