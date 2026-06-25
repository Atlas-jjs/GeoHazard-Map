import { AppState } from "../../config.js";
import {
  shouldProject,
  projectFeaturesChunked,
} from "../../utils/projection.js";
import { buildCodeColorMap } from "../../utils/colorUtils.js";
import {
  getFeatureName,
  highlightFeature,
  showFeatureDetails,
  getHighlightedFeature,
  clearHighlightedFeature,
} from "../../components/featureDetails.js";
import { updateImportedLayersUI } from "./importLayersUI.js";

let _map = null;

export function setMap(map) {
  _map = map;
}
export function getMap() {
  return _map;
}

// ── Layer Creation ────────────────────────────────────────────────────────────

export function addCustomLayerToMap(geojson, name, color) {
  const id = "custom-" + Date.now();
  const codeColorMap = buildCodeColorMap(geojson);
  const style = { color, weight: 2.5, fillOpacity: 0.4, fillColor: color };
  const layerItem = {
    id,
    name,
    color,
    data: geojson,
    codeColorMap,
    leafletLayer: null,
    checked: true,
    style,
  };

  if (shouldProject(geojson)) {
    projectFeaturesChunked(geojson.features, () =>
      renderCustomImportLayer(layerItem),
    );
  } else {
    renderCustomImportLayer(layerItem);
  }
}

// ── Rendering ─────────────────────────────────────────────────────────────────

export function renderCustomImportLayer(layerItem) {
  const { codeColorMap } = layerItem;

  layerItem.leafletLayer = L.geoJSON(layerItem.data, {
    style: codeColorMap
      ? (feature) => {
          const code = String(feature.properties?.CODE ?? "");
          const color = codeColorMap[code] ?? layerItem.style.color;
          return { ...layerItem.style, color, fillColor: color };
        }
      : layerItem.style,
    onEachFeature: (feature, layer) => {
      layer.on({
        mouseover: (e) => {
          e.target.setStyle({
            weight: layerItem.style.weight + 1,
            color: "#ffffff",
            fillOpacity: Math.min(layerItem.style.fillOpacity + 0.15, 0.7),
          });
          const name = getFeatureName(feature.properties, "");
          if (name) {
            e.target
              .bindTooltip(name, { sticky: true, className: "premium-tooltip" })
              .openTooltip();
          }
        },
        mouseout: (e) => layerItem.leafletLayer.resetStyle(e.target),
        click: (e) => {
          if (e.target.getBounds) _map.fitBounds(e.target.getBounds());
          highlightFeature(e.target);
          showFeatureDetails(feature.properties, layerItem.name);
        },
      });
    },
  });

  if (layerItem.checked) _map.addLayer(layerItem.leafletLayer);

  AppState.importedLayers.push(layerItem);
  applyLayerZOrdering();
  updateImportedLayersUI();
}

// ── Z-Ordering ────────────────────────────────────────────────────────────────

export function applyLayerZOrdering() {
  for (let i = AppState.importedLayers.length - 1; i >= 0; i--) {
    const { leafletLayer, checked } = AppState.importedLayers[i];
    if (leafletLayer && checked && _map.hasLayer(leafletLayer)) {
      leafletLayer.bringToFront();
    }
  }
}

// ── Removal ───────────────────────────────────────────────────────────────────

export function removeCustomLayer(id) {
  const index = AppState.importedLayers.findIndex((item) => item.id === id);
  if (index === -1) return;

  const layerItem = AppState.importedLayers[index];

  if (layerItem.leafletLayer && _map.hasLayer(layerItem.leafletLayer)) {
    _map.removeLayer(layerItem.leafletLayer);
  }

  AppState.importedLayers.splice(index, 1);

  const highlighted = getHighlightedFeature();
  if (highlighted && layerItem.leafletLayer?.hasLayer(highlighted)) {
    document.getElementById("details-panel").classList.add("hidden");
    clearHighlightedFeature();
  }

  updateImportedLayersUI();
}
