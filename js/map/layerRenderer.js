import { AppState } from "../config.js";
import { shouldProject, projectFeaturesChunked } from "../utils/projection.js";
import {
  getFeatureName,
  highlightFeature,
  showFeatureDetails,
} from "../components/featureDetails.js";

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
  const customCheckbox =
    checkbox.parentElement.querySelector(".checkbox-custom");
  const row = checkbox.closest(".control-checkbox");

  // ! Guard to prevent loading the spinner while it is already loading
  if (row.classList.contains("layer-loading")) return;

  const loader = document.createElement("div");
  loader.classList.add("layer-loader");
  checkbox.parentElement.insertBefore(loader, checkbox);
  checkbox.classList.add("hidden");
  customCheckbox.style.display = "none";
  row.classList.add("layer-loading");

  const stopLoader = () => {
    loader.remove();
    checkbox.classList.remove("hidden");
    customCheckbox.style.display = "";
    row.classList.remove("layer-loading");
  };

  fetch(layerInfo.url)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((geojson) => {
      if (shouldProject(geojson)) {
        projectFeaturesChunked(geojson.features, () => {
          stopLoader();
          handleGeoJSONLoadSuccess(key, geojson);
        });
      } else {
        stopLoader();
        handleGeoJSONLoadSuccess(key, geojson);
      }
    })
    .catch((err) => {
      console.error(`Load failed for ${layerInfo.url}:`, err);
      stopLoader();
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
function handleGeoJSONLoadSuccess(key, geojson) {
  const layerInfo = AppState.layers[key];
  layerInfo.data = geojson;
  layerInfo.loaded = true;

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

  layerInfo.leafletLayer = L.geoJSON(layerInfo.data, {
    style:
      layerInfo.colorField && layerInfo.codeColors
        ? (feature) => {
            const code = String(
              feature.properties?.[layerInfo.colorField] ?? "",
            );
            const color =
              layerInfo.codeColors[code] ?? layerInfo.style.fillColor;
            return { ...layerInfo.style, color, fillColor: color };
          }
        : layerInfo.style,
    onEachFeature: (feature, layer) => {
      layer.on({
        mouseover: (e) => {
          const outline = e.target;

          // Does not override the selectedLayer when hovering other polygons
          if (outline === layerInfo.selectedLayer) return;

          outline.setStyle({
            weight: layerInfo.style.weight + 1,
            color: "#ffffff",
            fillOpacity: layerInfo.style.fillOpacity,
          });

          outline.bringToFront();

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
          const outline = e.target;
          if (outline === layerInfo.selectedLayer) return;
          layerInfo.leafletLayer.resetStyle(outline);
          outline.closeTooltip();
        },
        click: (e) => {
          if (e.target.getBounds) {
            _map.fitBounds(e.target.getBounds());
          }

          // Unhighlight previous selection
          if (layerInfo.selectedLayer && layerInfo.selectedLayer !== e.target) {
            layerInfo.leafletLayer.resetStyle(layerInfo.selectedLayer);
          }

          layerInfo.selectedLayer = e.target;
          highlightFeature(e.target);
          showFeatureDetails(feature.properties, layerInfo.name);

          L.DomEvent.stopPropagation(e);
        },
      });
    },
  });

  if (layerInfo.checked) {
    _map.addLayer(layerInfo.leafletLayer);
  }
}
