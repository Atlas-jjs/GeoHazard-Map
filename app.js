import { BASEMAPS, BasemapSwitcher } from "./js/map/basemap.js";
import { initUIControls } from "./js/components/uiControls.js";
import {
  initLayerRenderer,
  loadDefaultLayers,
} from "./js/map/layerRenderer.js";
import { initImportManager } from "./js/map/importManager.js";
import { initMeasureTool } from "./js/components/measureTool.js";
import { initScreenshot } from "./js/components/screenshot.js";

let map = null;

// * Initialize Map on Load
document.addEventListener("DOMContentLoaded", () => {
  lucide.createIcons();

  // Bounds configuration for CAR, Philippines to lock pan/zoom view
  const southWest = L.latLng(12.7, 114.0);
  const northEast = L.latLng(22.0, 128.0);
  const mapBounds = L.latLngBounds(southWest, northEast);

  map = L.map("map", {
    maxBounds: mapBounds,
    maxBoundsViscosity: 1.0,
    inertia: false,
    minZoom: 8,
    maxZoom: 18,
    zoomControl: true,
  }).setView([17.25, 120.9], 8);

  console.log(map);

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
  initScreenshot(map);
  loadDefaultLayers();
});
