<?php
// ============================================================
//  CAR GeoPortal — Layers API
//  File   : api/layers.php
//  Place  : htdocs/<your-project>/api/layers.php  (XAMPP)
//
//  Routes
//  ──────
//  GET    /api/layers.php              → all layers (ordered)
//  POST   /api/layers.php              → upsert (insert or update) a layer
//  DELETE /api/layers.php?id=xxx       → delete layer by id
//  GET    /api/layers.php?action=ping  → connectivity check
// ============================================================

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// memory_limit CAN be raised at runtime (unlike post_max_size /
// upload_max_filesize, which must be set in php.ini before the
// request starts). Large GeoJSON layers need headroom for
// json_decode() + json_encode() working copies.
ini_set('memory_limit', '512M');

// Convert any uncaught error (not just PDOException) into the same JSON
// envelope the client expects, instead of leaking an HTML fatal-error
// page into what api.js expects to be JSON.
set_exception_handler(function (Throwable $e) {
    jsonError(500, 'Unhandled server error: ' . $e->getMessage());
});

// ── Database configuration ──────────────────────────────────
define('DB_HOST', 'localhost');
define('DB_NAME', 'denr_imported_layers');
define('DB_USER', 'root');   // Change if your XAMPP MySQL user differs
define('DB_PASS', '');       // Change if your XAMPP MySQL password differs
define('DB_PORT', 3306);

// ── Bootstrap ───────────────────────────────────────────────
$pdo = connectDB();

try {
    // Best-effort: some MySQL/MariaDB builds only allow max_allowed_packet
    // to be set with SET GLOBAL (which needs elevated privileges), not
    // SET SESSION. If this fails, swallow it — large-payload requests will
    // instead need max_allowed_packet raised in my.ini (see note below).
    try {
        $pdo->exec('SET SESSION max_allowed_packet = 67108864');
    } catch (PDOException $e) {
        // ignore — not fatal, just means very large layers may fail later
        // with a "MySQL server has gone away" error. Fix: in
        // C:\xampp\mysql\bin\my.ini under [mysqld] add/edit:
        //   max_allowed_packet=64M
        // then restart MySQL in the XAMPP control panel.
    }

    route($pdo);
} catch (PDOException $e) {
    if (str_contains($e->getMessage(), "doesn't exist") || str_contains($e->getMessage(), 'Base table or view not found')) {
        jsonError(
            500,
            'Table "imported_layers" does not exist in database "' . DB_NAME . '". ' .
            'Run schema.sql (phpMyAdmin → Import, or `mysql -u root denr_imported_layers < schema.sql`) to create it.'
        );
    }
    jsonError(500, 'Database query failed: ' . $e->getMessage());
}

// ── Router ──────────────────────────────────────────────────
function route(PDO $pdo): void
{
    $method = $_SERVER['REQUEST_METHOD'];
    $action = $_GET['action'] ?? '';

    // Connectivity check — useful for debugging
    if ($method === 'GET' && $action === 'ping') {
        jsonOk(['pong' => true, 'db' => DB_NAME]);
    }

    match ($method) {
        'GET'    => handleGet($pdo),
        'POST'   => handlePost($pdo),
        'DELETE' => handleDelete($pdo),
        default  => jsonError(405, 'Method not allowed'),
    };
}

// ── GET — return all layers ordered by sort_order ───────────
function handleGet(PDO $pdo): void
{
    $stmt = $pdo->query(
        'SELECT id, name, color, color_mode, checked,
                style, code_color_map,
                needs_projection, proj_crs,
                data, sort_order
         FROM   imported_layers
         ORDER  BY sort_order ASC, created_at ASC'
    );

    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rows as &$row) {
        // Decode booleans
        $row['checked']          = (bool) $row['checked'];
        $row['needs_projection'] = (bool) $row['needs_projection'];
        $row['sort_order']       = (int)  $row['sort_order'];

        // Decode JSON columns — these are objects/arrays on the client
        $row['style']          = json_decode($row['style'],          true);
        $row['data']           = json_decode($row['data'],           true);
        $row['code_color_map'] = $row['code_color_map']
                                    ? json_decode($row['code_color_map'], true)
                                    : null;
    }
    unset($row);

    jsonOk($rows);
}

// ── POST — upsert a layer ───────────────────────────────────
function handlePost(PDO $pdo): void
{
    $raw  = file_get_contents('php://input');
    $body = json_decode($raw, true);

    if (!$body) {
        // An empty $raw with no error usually means PHP silently dropped
        // the body because it exceeded post_max_size in php.ini (XAMPP
        // ships with an 8M default — too small for layers like
        // ENGP_2011_2025 at 28MB). Increase post_max_size and
        // upload_max_filesize in php.ini, then restart Apache.
        if ($raw === '' && (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
            jsonError(
                413,
                'Request body was dropped before reaching PHP — likely ' .
                'because it exceeds post_max_size in php.ini. Edit ' .
                'php.ini (post_max_size and upload_max_filesize, e.g. ' .
                '64M), then restart Apache in XAMPP.'
            );
        }
        jsonError(400, 'Invalid or empty JSON body');
    }

    // Validate required fields
    foreach (['id', 'name', 'color', 'style', 'data'] as $field) {
        if (empty($body[$field])) {
            jsonError(400, "Missing required field: $field");
        }
    }

    // ── Detect if projection is needed ──────────────────────
    // Mirrors your JS shouldProject() from projection.js:
    //   1. Check CRS metadata string for "32651"
    //   2. Fallback: inspect first coordinate magnitude
    $needsProjection = false;
    $projCrs         = null;

    $crsName = $body['data']['crs']['properties']['name'] ?? null;
    if ($crsName) {
        $projCrs         = $crsName;
        $needsProjection = str_contains($crsName, '32651');
    } else {
        // Inspect first coordinate
        $features = $body['data']['features'] ?? [];
        if (!empty($features)) {
            $geom  = $features[0]['geometry'] ?? [];
            $type  = $geom['type']            ?? '';
            $coords = $geom['coordinates']    ?? [];

            $firstCoord = match ($type) {
                'Point'        => $coords,
                'LineString',
                'MultiPoint'   => $coords[0]       ?? null,
                'Polygon',
                'MultiLineString' => $coords[0][0]  ?? null,
                'MultiPolygon' => $coords[0][0][0]  ?? null,
                default        => null,
            };

            if ($firstCoord && isset($firstCoord[0]) && abs($firstCoord[0]) > 180) {
                $needsProjection = true;
            }
        }
    }

    // ── Determine color_mode ─────────────────────────────────
    // 'categorical' when a code_color_map is supplied by the client
    // (built by buildCodeColorMap() in colorUtils.js)
    $codeColorMap = $body['code_color_map'] ?? null;
    $colorMode    = ($codeColorMap !== null) ? 'categorical' : 'single';

    $stmt = $pdo->prepare(
        'INSERT INTO imported_layers
             (id, name, color, color_mode, checked,
              style, code_color_map,
              needs_projection, proj_crs,
              data, sort_order)
         VALUES
             (:id, :name, :color, :color_mode, :checked,
              :style, :code_color_map,
              :needs_projection, :proj_crs,
              :data, :sort_order)
         ON DUPLICATE KEY UPDATE
             name             = VALUES(name),
             color            = VALUES(color),
             color_mode       = VALUES(color_mode),
             checked          = VALUES(checked),
             style            = VALUES(style),
             code_color_map   = VALUES(code_color_map),
             needs_projection = VALUES(needs_projection),
             proj_crs         = VALUES(proj_crs),
             data             = VALUES(data),
             sort_order       = VALUES(sort_order)'
    );

    $stmt->execute([
        ':id'              => $body['id'],
        ':name'            => $body['name'],
        ':color'           => $body['color'],
        ':color_mode'      => $colorMode,
        ':checked'         => isset($body['checked']) ? (int) $body['checked'] : 1,
        ':style'           => json_encode($body['style']),
        ':code_color_map'  => $codeColorMap ? json_encode($codeColorMap) : null,
        ':needs_projection'=> (int) $needsProjection,
        ':proj_crs'        => $projCrs,
        ':data'            => json_encode($body['data']),
        ':sort_order'      => isset($body['order']) ? (int) $body['order'] : 0,
    ]);

    jsonOk([
        'saved'           => true,
        'id'              => $body['id'],
        'needs_projection'=> $needsProjection,
        'proj_crs'        => $projCrs,
        'color_mode'      => $colorMode,
    ]);
}

// ── DELETE — remove a layer by id ───────────────────────────
function handleDelete(PDO $pdo): void
{
    $id = trim($_GET['id'] ?? '');

    if ($id === '') {
        jsonError(400, 'Missing required query parameter: id');
    }

    $stmt = $pdo->prepare('DELETE FROM imported_layers WHERE id = :id');
    $stmt->execute([':id' => $id]);

    if ($stmt->rowCount() === 0) {
        jsonError(404, "Layer not found: $id");
    }

    jsonOk(['deleted' => true, 'id' => $id]);
}

// ── Database connection ──────────────────────────────────────
function connectDB(): PDO
{
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        DB_HOST, DB_PORT, DB_NAME
    );

    try {
        return new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    } catch (PDOException $e) {
        // Most common cause during setup: the "denr_imported_layers" database
        // hasn't been created yet. Run schema.sql in phpMyAdmin/MySQL first.
        if (str_contains($e->getMessage(), 'Unknown database')) {
            jsonError(
                500,
                'Database "' . DB_NAME . '" does not exist. Run schema.sql ' .
                '(phpMyAdmin → Import, or `mysql -u root < schema.sql`) to create it.'
            );
        }
        jsonError(500, 'Database connection failed: ' . $e->getMessage());
    }
}

// ── Response helpers ─────────────────────────────────────────
function jsonOk(mixed $data): never
{
    http_response_code(200);
    echo json_encode(['ok' => true, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}

function jsonError(int $code, string $message): never
{
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}