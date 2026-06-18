import { BASEMAPS, BasemapSwitcher } from "./js/map/basemap.js";
import { initUIControls } from "./js/components/uiControls.js";
import {
  initLayerRenderer,
  loadDefaultLayers,
} from "./js/map/layerRenderer.js";
import {
  restoreImportedLayers,
  initImportManager,
} from "./js/map/importManager.js";
import { initMeasureTool } from "./js/components/measureTool.js";

let map = null;

// * Initialize Map on Load
document.addEventListener("DOMContentLoaded", () => {
  lucide.createIcons();

  // Bounds configuration for CAR, Philippines to lock pan/zoom view
  const southWest = L.latLng(15.7, 119.5);
  const northEast = L.latLng(18.9, 122.5);
  const mapBounds = L.latLngBounds(southWest, northEast);

  map = L.map("map", {
    maxBounds: mapBounds,
    maxBoundsViscosity: 0.9,
    minZoom: 8,
    maxZoom: 18,
    zoomControl: true,
  }).setView([17.25, 120.9], 8);

  // * Initial Measuring Tool
  initMeasureTool(map);

  // * Default basemap
  let currentBasemap = BASEMAPS.satellite;
  currentBasemap.addTo(map);

  new BasemapSwitcher({
    currentBasemap,
    onChange: (newBasemap) => {
      currentBasemap = newBasemap;
    },
  }).addTo(map);

  // Setup Event Listeners for UI
  initLayerRenderer(map);
  initUIControls(map);
  initImportManager(map);
  loadDefaultLayers();
});
