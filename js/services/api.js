// ============================================================
//  api.js  —  replaces database.js
//
//  Drop-in replacement for the three IndexedDB functions.
//  Update the import in importManager.js and app.js:
//
//    // Before:
//    import { ... } from "./database.js";
//    // After:
//    import { ... } from "./api.js";
//
//  The PHP endpoint: htdocs/<project>/api/layers.php
//
//  Key difference from database.js
//  ─────────────────────────────────
//  saveImportedLayerToDB() now returns { needsProjection, projCrs }
//  from the server response. The caller (importManager.js) can use
//  this to know whether to run projectFeaturesChunked() — matching
//  the same logic already in layerRenderer.js for built-in layers.
// ============================================================

const API_URL = "./api/layers.php";

// ── Internal fetch helper ────────────────────────────────────

/**
 * Thin fetch() wrapper that handles the JSON envelope { ok, data } / { ok, error }.
 *
 * @param {'GET'|'POST'|'DELETE'} method
 * @param {object|null} body    - request payload (POST only)
 * @param {string}      query   - query string e.g. '?id=custom-123'
 * @returns {Promise<any>}      - the `data` field from the API envelope
 */
async function apiFetch(method, body = null, query = "") {
  const url = API_URL + query;

  const options = {
    method,
    headers: { "Content-Type": "application/json" },
  };

  if (body !== null) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  let json;
  try {
    json = await response.json();
  } catch {
    // The server returned something that isn't JSON at all — typically
    // a PHP fatal error printed as HTML, or a 404 HTML page because the
    // path to layers.php is wrong, or Apache/MySQL isn't running.
    throw new Error(
      `[layers API] Server returned a non-JSON response (HTTP ${response.status}). ` +
        `Check that Apache + MySQL are running and that api/layers.php is reachable at "${url}".`,
    );
  }

  if (!json.ok) {
    throw new Error(
      `[layers API] ${json.error ?? "Unknown error"} (HTTP ${response.status})`,
    );
  }

  return json.data;
}

// ── Public API ───────────────────────────────────────────────

/**
 * Save or update a custom layer in MySQL.
 *
 * Sends the full GeoJSON payload to the server. The PHP API:
 *   - Stores it in LONGTEXT (safe up to ~4 GB; ENGP_2011_2025 is 28 MB)
 *   - Detects EPSG:32651 CRS and sets needs_projection automatically
 *   - Sets color_mode to 'categorical' when a code_color_map is present
 *
 * Returns { needsProjection, projCrs } so the caller can decide
 * whether to run projectFeaturesChunked() before rendering.
 *
 * @param {Object} layerItem - layer item from AppState.importedLayers
 * @param {number} order     - position index for ordering
 * @returns {Promise<{ needsProjection: boolean, projCrs: string|null }|undefined>}
 */
export async function saveImportedLayerToDB(layerItem, order) {
  try {
    const payload = {
      id: layerItem.id,
      name: layerItem.name,
      color: layerItem.color,
      checked: layerItem.checked,
      style: layerItem.style,
      data: layerItem.data, // full GeoJSON FeatureCollection
      code_color_map: layerItem.codeColorMap ?? null,
      order,
    };

    const result = await apiFetch("POST", payload);

    // Return projection metadata so importManager can act on it
    return {
      needsProjection: result.needs_projection ?? false,
      projCrs: result.proj_crs ?? null,
    };
  } catch (err) {
    console.error("Failed to write layer to database:", err);
    alert(
      `"${layerItem.name}" was added to the map but could NOT be saved to the database, so it will disappear on refresh.\n\nReason: ${err.message}`,
    );
  }
}

/**
 * Delete a custom layer from MySQL by unique ID.
 *
 * @param {string} id - The layer's unique identifier e.g. "custom-1718000000000"
 * @returns {Promise<boolean|undefined>}
 */
export async function deleteImportedLayerFromDB(id) {
  try {
    await apiFetch("DELETE", null, `?id=${encodeURIComponent(id)}`);
    return true;
  } catch (err) {
    console.error("Failed to delete layer from database:", err);
    alert(
      `Removed from the map, but failed to delete from the database (it may reappear on refresh).\n\nReason: ${err.message}`,
    );
  }
}

/**
 * Load all stored layers from MySQL, ordered by sort_order.
 *
 * Returns the same shape that IndexedDB used to return, plus two
 * extra fields the server now provides:
 *   - needsProjection {boolean} — mirrors shouldProject() output
 *   - projCrs         {string}  — raw CRS name e.g. "urn:ogc:def:crs:EPSG::32651"
 *
 * restoreImportedLayers() in importManager.js should check
 * needsProjection and call projectFeaturesChunked() before rendering
 * for layers like ENGP_2011_2025 that are stored in UTM coordinates.
 *
 * @returns {Promise<Array>}
 */
export async function loadImportedLayersFromDB() {
  try {
    const rows = await apiFetch("GET");

    return rows.map((row) => ({
      ...row,
      // Remap snake_case → camelCase to match runtime field names
      codeColorMap: row.code_color_map ?? null,
      needsProjection: row.needs_projection ?? false,
      projCrs: row.proj_crs ?? null,
    }));
  } catch (err) {
    console.error("Failed to load layers from database:", err);
    alert(
      `Could not load your saved layers from the database.\n\nReason: ${err.message}`,
    );
    return [];
  }
}

/**
 * Ping the API to verify the PHP/MySQL connection is working.
 * Useful during development — call from the browser console:
 *   import { pingAPI } from './api.js'; pingAPI();
 *
 * @returns {Promise<boolean>}
 */
export async function pingAPI() {
  try {
    const result = await apiFetch("GET", null, "?action=ping");
    console.log("[api.js] ping OK →", result);
    return true;
  } catch (err) {
    console.error("[api.js] ping FAILED →", err);
    return false;
  }
}
