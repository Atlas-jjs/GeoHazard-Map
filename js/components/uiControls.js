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

  initOpacityControls();
  initWeightControls();
  activeLayerContainer();
  setupLayerCheckboxes();
}

// * Add event listener to switch between CADASTRE and NAMRIA Containers
function activeLayerContainer() {
  const cadContainer = document.getElementById("cad-controls-container");
  const namriaContainer = document.getElementById("namria-controls-container");

  function setCheckboxState(container, disabled) {
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');

    checkboxes.forEach((checkbox) => {
      checkbox.disabled = disabled;

      if (disabled && checkbox.checked) {
        checkbox.checked = false;
        checkbox.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  }

  function activateCad() {
    cadContainer.classList.remove("collapsed");
    namriaContainer.classList.add("collapsed");

    setCheckboxState(cadContainer, false);
    setCheckboxState(namriaContainer, true);
  }

  function activateNamria() {
    namriaContainer.classList.remove("collapsed");
    cadContainer.classList.add("collapsed");

    setCheckboxState(namriaContainer, false);
    setCheckboxState(cadContainer, true);
  }

  cadContainer.addEventListener("pointerdown", activateCad);
  namriaContainer.addEventListener("pointerdown", activateNamria);
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
        loadLayer(key);
      } else {
        if (layerInfo.leafletLayer && _map.hasLayer(layerInfo.leafletLayer)) {
          _map.removeLayer(layerInfo.leafletLayer);
        }
      }
    });
  });
}

function initOpacityControls() {
  document
    .querySelectorAll('.style-input[data-control="opacity"]')
    .forEach((control) => {
      const layerConfig = AppState.layers[control.dataset.layer];
      if (!layerConfig) return;

      const grip = control.querySelector(".opacity-grip");
      const input = control.querySelector(".opacity-number-input");

      input.value = Math.round(layerConfig.style.fillOpacity * 100);

      const applyOpacity = (pct) => {
        const clamped = Math.max(0, Math.min(100, Math.round(pct)));
        input.value = clamped;
        layerConfig.style.fillOpacity = clamped / 100;
        layerConfig.leafletLayer?.setStyle({ fillOpacity: clamped / 100 });
      };

      makeDragGrip(grip, () => parseInt(input.value), applyOpacity);

      input.addEventListener("click", (e) => e.stopPropagation());
      input.addEventListener("change", (e) => {
        e.stopPropagation();
        applyOpacity(parseInt(e.target.value) || 0);
      });
    });
}

function initWeightControls() {
  document
    .querySelectorAll('.style-input[data-control="weight"]')
    .forEach((control) => {
      const layerConfig = AppState.layers[control.dataset.layer];
      if (!layerConfig) return;

      const grip = control.querySelector(".weight-grip");
      const input = control.querySelector(".weight-number-input");

      input.value = layerConfig.style.weight ?? 1.5;

      const applyWeight = (val) => {
        const clamped = Math.max(0, Math.min(5, Math.round(val * 10) / 10));
        input.value = clamped;
        layerConfig.style.weight = clamped;
        layerConfig.leafletLayer?.setStyle({ weight: clamped });
      };

      // sensitivity: 0.05 keeps weight changes slow and fine-grained
      makeDragGrip(grip, () => parseFloat(input.value), applyWeight, 0.05);

      input.addEventListener("click", (e) => e.stopPropagation());
      input.addEventListener("change", (e) => {
        e.stopPropagation();
        applyWeight(parseFloat(e.target.value) || 0);
      });
    });
}

function makeDragGrip(grip, getValue, applyFn, sensitivity = 1) {
  // Guard: if already initialized, skip — prevents stacked listeners on re-render
  if (grip.dataset.dragInit === "true") return;
  grip.dataset.dragInit = "true";

  grip.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();

    grip.setPointerCapture(e.pointerId);

    const startX = e.clientX;
    const startVal = getValue();
    document.body.style.cursor = "ew-resize";

    const onMove = (e) =>
      applyFn(startVal + (e.clientX - startX) * sensitivity);

    const onUp = () => {
      document.body.style.cursor = "";
      grip.removeEventListener("pointermove", onMove);
      grip.removeEventListener("pointerup", onUp);
      grip.removeEventListener("pointercancel", onUp);
    };

    grip.addEventListener("pointermove", onMove);
    grip.addEventListener("pointerup", onUp);
    grip.addEventListener("pointercancel", onUp);
  });
}

(function () {
  /* ── elements ── */
  const trigger = document.getElementById("controls-trigger");
  const picker = document.getElementById("layout-picker");
  const btnSplit = document.getElementById("layout-split");
  const btnStacked = document.getElementById("layout-stacked");
  const cadContainer = document.getElementById("cad-controls-container");
  const namriaContainer = document.getElementById("namria-controls-container");
  const cadPanel = document.getElementById("cad-controls-panel");
  const namriaPanel = document.getElementById("namria-controls-panel");
  const switcher = document.getElementById("stacked-panel-switcher");
  const stackedTabs = switcher.querySelectorAll(".stacked-tab-btn");

  /* ── state ── */
  let pickerOpen = false;
  let layoutMode = "split";
  let activePanel = "cad";

  /* Toggle the picker popup on trigger click */
  trigger.addEventListener("click", () => {
    pickerOpen = !pickerOpen;
    picker.classList.toggle("hidden", !pickerOpen);
    trigger.classList.toggle("picker-open", pickerOpen);
  });

  /* Close picker when clicking outside */
  document.addEventListener("click", (e) => {
    if (
      pickerOpen &&
      !picker.contains(e.target) &&
      e.target !== trigger &&
      !trigger.contains(e.target)
    ) {
      pickerOpen = false;
      picker.classList.add("hidden");
      trigger.classList.remove("picker-open");
    }
  });

  /* Layout: SPLIT (default) */
  function applySplitLayout() {
    layoutMode = "split";
    cadContainer.classList.remove("stacked-mode");
    namriaContainer.classList.remove("stacked-mode");
    cadPanel.classList.remove("hidden");
    namriaPanel.classList.remove("hidden");
    switcher.classList.add("hidden");
    btnSplit.classList.add("active");
    btnStacked.classList.remove("active");
  }

  /* Layout: STACKED (both panels on right) */
  function applyStackedLayout() {
    layoutMode = "stacked";
    namriaContainer.classList.add("stacked-mode");
    cadContainer.classList.add("stacked-mode");
    switcher.classList.remove("hidden");
    showStackedPanel(activePanel);
    btnStacked.classList.add("active");
    btnSplit.classList.remove("active");
  }

  function showStackedPanel(panel) {
    activePanel = panel;
    if (panel === "cad") {
      cadPanel.classList.remove("hidden");
      namriaPanel.classList.add("hidden");
    } else {
      namriaPanel.classList.remove("hidden");
      cadPanel.classList.add("hidden");
    }
    stackedTabs.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.panel === panel);
    });
  }

  /* Bind layout option buttons */
  btnSplit.addEventListener("click", (e) => {
    e.stopPropagation();
    applySplitLayout();
    pickerOpen = false;
    picker.classList.add("hidden");
    trigger.classList.remove("picker-open");
  });

  btnStacked.addEventListener("click", (e) => {
    e.stopPropagation();
    applyStackedLayout();
    pickerOpen = false;
    picker.classList.add("hidden");
    trigger.classList.remove("picker-open");
  });

  /* Bind stacked tab switcher */
  stackedTabs.forEach((btn) => {
    btn.addEventListener("click", () => showStackedPanel(btn.dataset.panel));
  });

  /* Start in split layout */
  applySplitLayout();
})();
