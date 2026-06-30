import { resetHighlightedFeatures } from "../../map/featureHighlight.js";
import { initOpacityControls } from "../layers/opacityControls.js";
import { initWeightControls } from "../layers/weightControls.js";
// import { initLayerContainer } from "../layers/layerSwitcher.js";
import { setupLayerCheckboxes } from "../layers/layerControls.js";

/*
 * Sets up core event listeners for UI components including the control panel toggle, details panel close button, tab switching functionality, and specific map layer triggers.
 */
export function initPanelController(map) {
  // Trigger Button to open the tabs
  const triggerBtn = document.getElementById("controls-trigger");
  const cadPanel = document.getElementById("cad-controls-container");
  const namriaPanel = document.getElementById("namria-controls-container");

  triggerBtn?.addEventListener("click", () => {
    cadPanel.classList.toggle("hidden");
    namriaPanel.classList.toggle("hidden");
    triggerBtn.classList.toggle("active");
  });

  // Close the Details Modal
  const closeDetailsBtn = document.getElementById("close-details");
  const detailsPanel = document.getElementById("details-panel");
  closeDetailsBtn?.addEventListener("click", () => {
    detailsPanel.classList.add("hidden");
    resetHighlightedFeatures();
  });

  initOpacityControls();
  initWeightControls();
  // initLayerContainer();
  setupLayerCheckboxes(map);
}
