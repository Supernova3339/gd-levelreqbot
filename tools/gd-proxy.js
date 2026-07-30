// Simple local proxy for testing GD API endpoints without CORS issues.
// Usage: node tools/gd-proxy.js
// Then open gdlogin.html — it will POST to localhost:8765 which forwards to boomlings.com.

const http = require("http");
const https = require("https");

const PORT = 8765;
const GD_HOST = "www.boomlings.com";

const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    let body = "";
    req.on("data", chunk => {
        body += chunk;
    });
    req.on("end", () => {
        const path = req.url; // e.g. /database/accounts/loginGJAccount.php
        console.log(`→ POST https://${GD_HOST}${path}`);
        console.log(`  body: ${body}`);

        const options = {
            hostname: GD_HOST,
            path,
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Content-Length": Buffer.byteLength(body),
                "User-Agent": "",
            },
        };

        const proxy = https.request(options, (upstream) => {
            let data = "";
            upstream.on("data", chunk => {
                data += chunk;
            });
            upstream.on("end", () => {
                console.log(`← HTTP ${upstream.statusCode}: ${data}`);
                res.writeHead(upstream.statusCode, {"Content-Type": "text/plain"});
                res.end(data);
            });
        });

        proxy.on("error", err => {
            console.error("Proxy error:", err.message);
            res.writeHead(502);
            res.end(`Proxy error: ${err.message}`);
        });

        proxy.write(body);
        proxy.end();
    });
});

server.listen(PORT, () => {
    console.log(`GD proxy listening on http://localhost:${PORT}`);
    console.log(`Open gdlogin.html in your browser.`);
});
