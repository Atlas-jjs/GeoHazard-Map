import { AppState } from "../config.js";
import { loadLayer } from "../map/layerRenderer.js";
import { resetHighlightedFeatures } from "./featureDetails.js";

let _map = null;

export function initUIControls(map) {
  _map = map;
  setupUIEventListeners();
}

/* *
 * Sets up core event listeners for UI components including the control panel toggle, details panel close button, tab switching functionality, and specific map layer triggers.
 */
function setupUIEventListeners() {
  // Trigger Button to open the tabs
  const triggerBtn = document.getElementById("controls-trigger");
  const panel = document.getElementById("controls-panel");

  triggerBtn?.addEventListener("click", () => {
    panel.classList.toggle("hidden");
    triggerBtn.classList.toggle("active");
  });

  //   Close the Details Modal
  const closeDetailsBtn = document.getElementById("close-details");
  const detailsPanel = document.getElementById("details-panel");
  closeDetailsBtn?.addEventListener("click", () => {
    detailsPanel.classList.add("hidden");
    resetHighlightedFeatures();
  });

  // Tab switching
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabPanes = document.querySelectorAll(".tab-pane");

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetTab = btn.getAttribute("data-tab");
      tabBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      tabPanes.forEach((pane) => {
        pane.classList.remove("active");
        if (pane.id === `tab-${targetTab}`) pane.classList.add("active");
      });
    });
  });

  setupSourceToggle();

  // Layer checkboxes
  setupLayerCheckboxes();
}

/* *
 * Initializes listeners and sub-functions for toggling between different data sources (NAMRIA vs CAD) and coordinates the visibility of their respective UI containers and map layers.
 */
function setupSourceToggle() {
  const NAMRIA_KEYS = ["namria-boundary", "province", "municipality"];
  const CAD_KEYS = ["cad-boundary", "cad-province", "cad-municipality"];

  const btnNamria = document.getElementById("btn-src-namria");
  const btnCad = document.getElementById("btn-src-cad");

  const namriaRows = [
    document.getElementById("wrap-namria-boundary"),
    document.getElementById("wrap-namria-province"),
    document.getElementById("wrap-namria-municipality"),
  ];
  const cadRows = [
    document.getElementById("wrap-cad-boundary"),
    document.getElementById("wrap-cad-province"),
    document.getElementById("wrap-cad-municipality"),
  ];

  function activateSource(source) {
    const isNamria = source === "namria";

    btnNamria.classList.toggle("active", isNamria);
    btnCad.classList.toggle("active", !isNamria);

    namriaRows.forEach((el) => el.classList.toggle("hidden", !isNamria));
    cadRows.forEach((el) => el.classList.toggle("hidden", isNamria));

    [...NAMRIA_KEYS, ...CAD_KEYS].forEach((key) => {
      const layerInfo = AppState.layers[key];
      if (layerInfo?.leafletLayer && _map.hasLayer(layerInfo.leafletLayer)) {
        _map.removeLayer(layerInfo.leafletLayer);
      }
    });

    const hiddenRows = isNamria ? cadRows : namriaRows;
    hiddenRows.forEach((row) => {
      const cb = row.querySelector("input[type=checkbox]");
      if (cb) cb.checked = false;
    });

    const activeKeys = isNamria ? NAMRIA_KEYS : CAD_KEYS;
    activeKeys.forEach((key) => {
      const layerInfo = AppState.layers[key];
      const cb = document.getElementById(layerInfo.id);
      if (!cb?.checked) return;

      if (layerInfo.loaded && layerInfo.leafletLayer) {
        _map.addLayer(layerInfo.leafletLayer);
      } else {
        loadLayer(key);
      }
    });
  }

  btnNamria.addEventListener("click", () => activateSource("namria"));
  btnCad.addEventListener("click", () => activateSource("cad"));
}

/* *
 * Attaches change event listeners to individual layer checkboxes dynamically based on AppState,
 * enabling users to explicitly add or remove specific data layers from the Leaflet map instance.
 */
function setupLayerCheckboxes() {
  Object.keys(AppState.layers).forEach((key) => {
    const layerInfo = AppState.layers[key];
    const checkbox = document.getElementById(layerInfo.id);
    if (!checkbox) return;

    checkbox.addEventListener("change", (e) => {
      layerInfo.checked = e.target.checked;

      if (layerInfo.checked) {
        if (layerInfo.loaded && layerInfo.leafletLayer) {
          _map.addLayer(layerInfo.leafletLayer);
        } else {
          loadLayer(key);
        }
      } else {
        if (layerInfo.leafletLayer && _map.hasLayer(layerInfo.leafletLayer)) {
          _map.removeLayer(layerInfo.leafletLayer);
        }
      }
    });
  });
}
