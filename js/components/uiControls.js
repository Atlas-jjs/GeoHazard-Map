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
  const cadPanel = document.getElementById("cad-controls-panel");
  const namriaPanel = document.getElementById("namria-controls-panel");

  triggerBtn?.addEventListener("click", () => {
    cadPanel.classList.toggle("hidden");
    namriaPanel.classList.toggle("hidden");
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

  // Layer checkboxes
  setupLayerCheckboxes();
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
