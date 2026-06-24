import { AppState } from "../config.js";
import { shouldProject, projectFeaturesChunked } from "../utils/projection.js";
import {
  getFeatureName,
  highlightFeature,
  showFeatureDetails,
} from "../components/featureDetails.js";
import { buildCodeColorMap } from "../utils/colorUtils.js";

let _map = null;

/* *
 * Initialize the layer renderer with the Leaflet map instance.
 * @param {L.Map} map
 */
export function initLayerRenderer(map) {
  _map = map;
}

/* *
 * Load all layers that are checked by default in AppState.
 * Manages the page loader overlay dismissal.
 */
export function loadDefaultLayers() {
  const defaultKeys = Object.keys(AppState.layers).filter(
    (key) => AppState.layers[key].checked,
  );

  // Track how many layers still need to finish
  AppState.pendingLayerCount = defaultKeys.length;
  defaultKeys.forEach((key) => loadLayer(key));
}

/* *
 * Fetch and render a specific GeoJSON layer by key.
 * Projects coordinates if needed, shows loading spinner.
 * @param {string} key - Layer key from AppState.layers
 */
export function loadLayer(key) {
  const layerInfo = AppState.layers[key];
  if (!layerInfo) return;

  const checkbox = document.getElementById(layerInfo.id);
  const spinner = checkbox.parentElement.querySelector(".spinner-inline");

  // Toggle Loading Indicator
  if (spinner) spinner.classList.remove("hidden");

  fetch(layerInfo.url)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((geojson) => {
      if (shouldProject(geojson)) {
        projectFeaturesChunked(geojson.features, () => {
          handleGeoJSONLoadSuccess(key, geojson, spinner);
        });
      } else {
        handleGeoJSONLoadSuccess(key, geojson, spinner);
      }
    })
    .catch((err) => {
      console.error(`Load failed for ${layerInfo.url}:`, err);

      if (spinner) spinner.classList.add("hidden");
      checkbox.checked = false;
      layerInfo.checked = false;
      alert(
        `Failed to load ${layerInfo.name} layer. Make sure the .geojson file exists in the GeoJson folder.`,
      );
    });
}

// Internal Helpers

/* *
 * Handle successfully loaded and projected GeoJSON data.
 */
function handleGeoJSONLoadSuccess(key, geojson, spinner) {
  const layerInfo = AppState.layers[key];
  layerInfo.data = geojson;
  layerInfo.loaded = true;

  if (spinner) spinner.classList.add("hidden");

  // Render Layer on Map
  renderGeoJSONLayer(key);

  AppState.pendingLayerCount--;
  if (AppState.pendingLayerCount <= 0) {
    document.getElementById("page-loader").classList.add("hidden");
  }
}

/* *
 * Create and add a Leaflet GeoJSON layer with style and interactivity bindings.
 */
function renderGeoJSONLayer(key) {
  const layerInfo = AppState.layers[key];
  if (!layerInfo.data) return;

  if (layerInfo.leafletLayer && _map.hasLayer(layerInfo.leafletLayer)) {
    _map.removeLayer(layerInfo.leafletLayer);
  }

  const colorField = layerInfo.colorField;
  const codeColorMap = buildCodeColorMap(
    layerInfo.data,
    layerInfo.codeColors,
    colorField,
  );
  layerInfo.codeColorMap = codeColorMap;

  layerInfo.leafletLayer = L.geoJSON(layerInfo.data, {
    style: codeColorMap
      ? (feature) => {
          const code = String(feature.properties?.[colorField] ?? "");
          const color = codeColorMap[code] ?? layerInfo.style.fillColor;
          return { ...layerInfo.style, color, fillColor: color };
        }
      : layerInfo.style,
    onEachFeature: (feature, layer) => {
      // console.log(feature.properties);

      layer.on({
        mouseover: (e) => {
          const outline = e.target;
          outline.setStyle({
            weight: layerInfo.style.weight + 1,
            color: "#ffffff",
            fillOpacity: Math.min(layerInfo.style.fillOpacity + 0.15, 0.7),
          });

          let name = getFeatureName(feature.properties, key);
          if (name) {
            outline
              .bindTooltip(name, {
                sticky: true,
                className: "premium-tooltip",
              })
              .openTooltip();
          }
        },
        mouseout: (e) => {
          layerInfo.leafletLayer.resetStyle(e.target);
        },
        click: (e) => {
          if (e.target.getBounds) {
            _map.fitBounds(e.target.getBounds());
          }
          highlightFeature(e.target);
          showFeatureDetails(feature.properties, layerInfo.name);
        },
      });
    },
  });

  if (layerInfo.checked) {
    _map.addLayer(layerInfo.leafletLayer);
  }
}
