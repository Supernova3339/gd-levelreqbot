<?php
/**
 * GD Level Request Bot — Marketplace Server Configuration
 */

define('DB_HOST',    'localhost');
define('DB_NAME',    'supersft_gdlrqb_marketplace');
define('DB_USER',    'supersft_gdlrqb_marketplace');
define('DB_PASS',    'REDACTED_DB_PASSWORD'); // TODO: fill in marketplace DB password
define('DB_CHARSET', 'utf8mb4');

define('BASE_PATH', '/gdlvlreqbot/marketplace');
define('BASE_URL',  'https://dl.supers0ft.us/gdlvlreqbot/marketplace');

// Public key for verifying license tokens issued by the licensing service.
// Copy from external/licensing/keys/public.pem
define('LICENSE_PUBLIC_KEY_PATH', __DIR__ . '/keys/public.pem');

// GitHub IDs treated as marketplace owners (can publish/edit/delete).
// Mirror of OWNER_GITHUB_IDS in external/licensing/config.php.
define('OWNER_GITHUB_IDS', [63515814]);

date_default_timezone_set('UTC');

// ─── Rate limiting (APCu, 120 req/min per IP) ────────────────────────────────

function checkRateLimit(): void {
    if (!function_exists('apcu_fetch')) return;
    $key = 'rl:mp:' . md5($_SERVER['REMOTE_ADDR'] ?? '');
    if ((int)apcu_fetch($key) > 120) jsonOut(['error' => 'Rate limit exceeded'], 429);
    apcu_add($key, 0, 60);
    apcu_inc($key);
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function jsonOut(array $data, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json');
    header('Access-Control-Allow-Origin: *');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function getJsonBody(): array {
    $raw = file_get_contents('php://input');
    if (empty($raw)) return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function getPdo(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = sprintf('mysql:host=%s;dbname=%s;charset=%s', DB_HOST, DB_NAME, DB_CHARSET);
        try {
            $pdo = new PDO($dsn, DB_USER, DB_PASS, [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]);
        } catch (PDOException $e) {
            error_log('[marketplace] DB error: ' . $e->getMessage());
            jsonOut(['error' => 'Service temporarily unavailable'], 503);
        }
    }
    return $pdo;
}

/**
 * Verify a license token from the Authorization: Bearer header.
 * Returns the decoded payload array on success, null if absent or invalid.
 */
function verifyLicenseToken(): ?array {
    $header = $_SERVER['HTTP_AUTHORIZATION']
        ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
        ?? (function_exists('apache_request_headers') ? (apache_request_headers()['Authorization'] ?? '') : '')
        ?? '';
    if (!str_starts_with($header, 'Bearer ')) return null;
    $token = substr($header, 7);

    $parts = explode('.', $token, 2);
    if (count($parts) !== 2) return null;
    [$b64payload, $b64sig] = $parts;

    $payload = base64_decode($b64payload, true);
    $sig     = base64_decode($b64sig, true);
    if ($payload === false || $sig === false) return null;

    if (!file_exists(LICENSE_PUBLIC_KEY_PATH)) return null;
    $pubKey = openssl_pkey_get_public(file_get_contents(LICENSE_PUBLIC_KEY_PATH));
    if ($pubKey === false) return null;

    if (openssl_verify($payload, $sig, $pubKey, OPENSSL_ALGO_SHA256) !== 1) return null;

    $data = json_decode($payload, true);
    if (!is_array($data)) return null;
    if (isset($data['exp']) && $data['exp'] < time()) return null;

    return $data;
}

/**
 * Admin endpoints require a valid license token belonging to an owner account.
 */
function requireAdmin(): void {
    $user = verifyLicenseToken();
    if (!$user || !in_array((int)($user['sub'] ?? 0), OWNER_GITHUB_IDS, true)) {
        jsonOut(['error' => 'Unauthorized'], 401);
    }
}

function versionGt(string $a, string $b): bool {
    return version_compare(ltrim($a, 'v'), ltrim($b, 'v'), '>');
}
