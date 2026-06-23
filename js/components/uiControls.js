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
  // const tabBtn = document.querySelector(".tab-btn");
  // const tabBtns = document.querySelectorAll(".tab-btn");
  // const tabPanes = document.querySelectorAll(".tab-pane");

  // tabBtn.addEventListener("click", () => {
  //   const targetTab = tabBtn.getAttribute("data-tab");
  //   // tabBtn.classList.remove("active");
  //   // tabBtns.forEach((b) => b.classList.remove("active"));
  //   tabBtn.classList.add("active");
  //   tabPanes.forEach((pane) => {
  //     pane.classList.remove("active");
  //     if (pane.id === `tab-${targetTab}`) pane.classList.add("active");
  //   });
  // });

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

  // ? Control the opacity of the fillColor of the layer
  document
    .querySelectorAll('.style-input[data-control="opacity"]')
    .forEach((control) => {
      const layerConfig = AppState.layers[control.dataset.layer];
      if (!layerConfig) return;

      const grip = control.querySelector(".opacity-grip");
      const input = control.querySelector(".opacity-number-input");

      // Sync from AppState, no hardcoded value
      input.value = Math.round(layerConfig.style.fillOpacity * 100);

      const applyOpacity = (pct) => {
        const clamped = Math.max(0, Math.min(100, Math.round(pct)));
        input.value = clamped;
        layerConfig.style.fillOpacity = clamped / 100;
        if (layerConfig.leafletLayer) {
          layerConfig.leafletLayer.setStyle({ fillOpacity: clamped / 100 });
        }
      };

      grip.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startVal = parseInt(input.value);
        document.body.style.cursor = "ew-resize";

        const onMouseMove = (e) =>
          applyOpacity(startVal + Math.round(e.clientX - startX));
        const onMouseUp = () => {
          document.body.style.cursor = "";
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
      });

      input.addEventListener("click", (e) => e.stopPropagation());
      input.addEventListener("change", (e) => {
        e.stopPropagation();
        applyOpacity(parseInt(e.target.value) || 0);
      });
    });

  // ? Control the "thickness" or weight of the borders of a layer
  document
    .querySelectorAll('.style-input[data-control="weight"]')
    .forEach((control) => {
      const layerConfig = AppState.layers[control.dataset.layer];
      if (!layerConfig) return;

      const grip = control.querySelector(".weight-grip");
      const input = control.querySelector(".weight-number-input");

      // Sync from AppState, no hardcoded value
      input.value = layerConfig.style.weight ?? 1.5;

      const applyWeight = (val) => {
        const clamped = Math.max(0, Math.min(5, Math.round(val * 10) / 10));
        input.value = clamped;
        layerConfig.style.weight = clamped;
        if (layerConfig.leafletLayer) {
          layerConfig.leafletLayer.setStyle({ weight: clamped });
        }
      };

      grip.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startVal = parseFloat(input.value);
        document.body.style.cursor = "ew-resize";

        const onMouseMove = (e) =>
          applyWeight(startVal + ((e.clientX - startX) / 10) * 0.5);
        const onMouseUp = () => {
          document.body.style.cursor = "";
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
      });

      input.addEventListener("click", (e) => e.stopPropagation());
      input.addEventListener("change", (e) => {
        e.stopPropagation();
        applyWeight(parseFloat(e.target.value) || 0);
      });
    });

  // ? Disable the NAMRIA Boundary and Provincial Layers if NAMRIA Municipalities is currently selected
  const municipalityCheckbox = document.getElementById("layer-municipality");
  const boundaryCheckbox = document.getElementById("layer-namria-boundary");
  const provinceCheckbox = document.getElementById("layer-province");

  const wrapBoundary = document.getElementById("wrap-namria-boundary");
  const wrapProvince = document.getElementById("wrap-namria-province");

  municipalityCheckbox?.addEventListener("change", (e) => {
    if (e.target.checked) {
      [boundaryCheckbox, provinceCheckbox].forEach((cb) => {
        if (!cb) return;
        cb.checked = false;
        cb.dispatchEvent(new Event("change"));
      });

      wrapBoundary?.classList.add("layer-disabled");
      wrapProvince?.classList.add("layer-disabled");
      boundaryCheckbox.disabled = true;
      provinceCheckbox.disabled = true;
    } else {
      // Re-enable when municipality is unchecked
      wrapBoundary?.classList.remove("layer-disabled");
      wrapProvince?.classList.remove("layer-disabled");
      boundaryCheckbox.disabled = false;
      provinceCheckbox.disabled = false;
    }
  });

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

    const checkboxCustom =
      checkbox.parentElement.querySelector(".checkbox-custom");

    if (checkboxCustom) {
      checkboxCustom.addEventListener("click", () => {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event("change"));
      });
    }

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
