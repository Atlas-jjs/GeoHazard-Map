import { initOpacityControls } from "../layers/opacityControls.js";
import { initWeightControls } from "../layers/weightControls.js";
// import { initLayerContainer } from "../layers/layerSwitcher.js";
import { setupLayerCheckboxes } from "../layers/layerControls.js";
import { deselectCurrentBoundary } from "../../map/layerRenderer.js";

/*
 * Sets up core event listeners for UI components including the control panel toggle, details panel close button, tab switching functionality, and specific map layer triggers.
 */
export function initPanelController(map) {
  // Trigger Button to open the tabs
  const triggerBtn = document.getElementById("controls-trigger");
  const panelDock = document.getElementById("panel-dock");

  triggerBtn?.addEventListener("click", () => {
    panelDock.classList.toggle("hidden");
    triggerBtn.classList.toggle("active");
  });

  // Close the Details Modal
  const closeDetailsBtn = document.getElementById("close-details");
  closeDetailsBtn?.addEventListener("click", () => {
    deselectCurrentBoundary();
  });

  initOpacityControls();
  initWeightControls();
  // initLayerContainer();
  setupLayerCheckboxes(map);
}

