import { AppState } from "../config.js";

let highlightedFeature = null;
const MAX_DISPLAY_ATTRIBUTES = 15;

// Attribute Display Configuration

/* *
 * Attributes always hidden regardless of layer.
 * Add any field names here you never want shown.
 */
const VISIBLE_ATTRIBUTES = new Set([
  "PERIMETER",
  "Perimeter",
  "X_COORD",
  "Y_COORD",
  "LONGITUDE",
  "LATITUDE",
  "LAT",
  "LON",
  "LONG",
]);

/* *
 * Determine whether a given attribute key should be shown.
 * @param {string} key
 * @returns {boolean}
 */
function shouldHideAttribute(key) {
  return !VISIBLE_ATTRIBUTES.has(key);
}

/* *
 * Per-layer attribute blocklists keyed by layer name.
 * Useful for hiding fields that are meaningful globally but
 * irrelevant for a specific layer.
 */
const LAYER_HIDDEN_ATTRIBUTES = {
  "NAMRIA Provinces": new Set(["PERIMETER", "Shape_Area"]),
  "NAMRIA Municipalities": new Set(["PERIMETER", "Shape_Area"]),
  "CAD Provinces": new Set(["PERIMETER", "Shape_Area"]),
  "CAD Municipalities": new Set(["PERIMETER", "Shape_Area"]),
};

/* *
 * Get the currently highlighted feature layer reference.
 * @returns {L.Layer|null}
 */
export function getHighlightedFeature() {
  return highlightedFeature;
}

/* *
 * Clear the highlighted feature reference without resetting styles.
 * Use when the parent layer is being removed from the map.
 */
export function clearHighlightedFeature() {
  highlightedFeature = null;
}

// ── Feature Name Resolution ──

/* *
 * Determine a human-readable name from feature properties.
 * Checks common GIS property fields in priority order.
 * @param {Object} properties - GeoJSON feature properties
 * @param {string} key - Layer key (unused, kept for API compatibility)
 * @returns {string|null}
 */
export function getFeatureName(properties, key) {
  // Default Layers
  if (properties.Muni_City) return properties.Muni_City;
  if (properties.Municipali) return properties.Municipali;
  if (properties.PROVINCE) return properties.PROVINCE;
  if (properties.Province) return properties.Province;

  // Imported/Hard-coded Layers
  if (properties.LndslideSu) return properties.LndslideSu;
  if (properties.FloodSusc) return properties.FloodSusc;
  if (properties.Erosion) return properties.Erosion;
  if (properties.DESCRIPT) return properties.DESCRIPT;
  if (properties.PPF_Type) return properties.PPF_Type;
  if (properties.CODE) return properties.CODE;
  if (properties.LCM_CLASS) return properties.LCM_CLASS;
  if (properties.Layer) return properties.Layer;
  if (properties.sw_code) return properties.sw_code;
  if (properties.WATERSHED) return properties.WATERSHED;
  if (properties.pa_name) return properties.pa_name;
  return null;
}

// Feature Highlighting

/* *
 * Apply a gold highlight outline to a clicked map feature.
 * Resets any previously highlighted feature first.
 * @param {L.Layer} layer - The Leaflet layer to highlight
 */
export function highlightFeature(layer) {
  resetHighlightedFeatures();
  highlightedFeature = layer;
  layer.setStyle({
    weight: 3.5,
    color: "#fbbf24", // Glow Yellow outline
    fillOpacity: 0.4,
  });
}

/* *
 * Reset the previously highlighted feature to its original style.
 */
export function resetHighlightedFeatures() {
  if (highlightedFeature) {
    // Search built-in layers
    const key = Object.keys(AppState.layers).find(
      (k) =>
        AppState.layers[k].leafletLayer &&
        AppState.layers[k].leafletLayer.hasLayer(highlightedFeature),
    );
    if (key && AppState.layers[key]) {
      AppState.layers[key].leafletLayer.resetStyle(highlightedFeature);
    } else {
      // Search custom imported layers
      const customLayer = AppState.importedLayers.find(
        (item) =>
          item.leafletLayer && item.leafletLayer.hasLayer(highlightedFeature),
      );
      if (customLayer) {
        customLayer.leafletLayer.resetStyle(highlightedFeature);
      }
    }
    highlightedFeature = null;
  }
}

// Details Panel

/* *
 * Render dynamic attributes inside the floating details panel.
 * @param {Object} properties - GeoJSON feature properties
 * @param {string} layerName - Display name of the parent layer
 */
export function showFeatureDetails(properties, layerName) {
  const detailsPanel = document.getElementById("details-panel");
  const detailsTitle = document.getElementById("details-title");
  const detailsLayerType = document.getElementById("details-layer-type");
  const detailsContent = document.getElementById("details-content");

  detailsLayerType.textContent = layerName;

  let title = getFeatureName(properties, "") || "Feature Details";
  detailsTitle.textContent = title;

  const visibleEntries = Object.entries(properties)
    .filter(([key, val]) => {
      if (val === null || val === undefined || val === "") return false;
      if (shouldHideAttribute(key)) return false;
      return true;
    })
    .slice(0, MAX_DISPLAY_ATTRIBUTES); // cap at 15

  if (visibleEntries.length === 0) {
    detailsContent.innerHTML =
      '<div class="empty-state">No metadata attributes found.</div>';
    detailsPanel.classList.remove("hidden");
    return;
  }

  let tableHtml = '<table class="details-table">';
  let counter = 0;

  for (const [key, val] of Object.entries(properties)) {
    if (val === null || val === undefined || val === "") continue;
    if (
      key.toLowerCase().includes("shape_") ||
      key.toLowerCase().includes("objectid")
    )
      continue;

    let label = formatKeyLabel(key);
    let displayVal = val;

    if (typeof val === "number") {
      if (val > 100) {
        displayVal = val.toLocaleString(undefined, {
          maximumFractionDigits: 2,
        });
      }
      if (
        key.toLowerCase().includes("hectare") ||
        key.toLowerCase().includes("area")
      ) {
        displayVal += " ha";
      }
    }

    tableHtml += `<tr><th>${label}</th><td>${displayVal}</td></tr>`;
    counter++;
  }

  tableHtml += "</table>";

  if (counter === 0) {
    detailsContent.innerHTML =
      '<div class="empty-state">No metadata attributes found.</div>';
  } else {
    detailsContent.innerHTML = tableHtml;
  }

  detailsPanel.classList.remove("hidden");
}

// Internal Helpers

/* *
 * Convert camelcase and snakecase property keys to readable labels.
 */
function formatKeyLabel(key) {
  const customLabels = {
    MUNI_CITY: "Municipality",
    PENRO: "PENRO Code",
    CENRO: "CENRO Name",
    NAME_PART: "PO Partner",
    YR_ESTAB: "Year Established",
    COMMODITY: "Commodity",
    SPECIES: "Species Planted",
    AREA_HA: "Area (Hectares)",
    Hectares: "Area (Hectares)",
    REGION: "Region",
    Remarks: "Remarks",
    REMARKS: "Remarks",
    Province: "Province Name",
    MUNICIPALI: "Municipality",
    BARANGAY: "Barangay",
    TENURE: "Tenure Code",
    STAT_REG: "Registration Status",
    CTRCT_ID: "Contract ID",
    UNIQ_ID: "Unique ID",
  };

  if (customLabels[key]) return customLabels[key];

  return key
    .replace(/_/g, " ")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}
