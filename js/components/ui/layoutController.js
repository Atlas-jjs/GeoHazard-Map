import { initLayerContainer } from "../layers/layerSwitcher.js";

export function initLayoutController() {
  const cadPanel = document.getElementById("cad-controls-panel");
  const namriaPanel = document.getElementById("namria-controls-panel");
  const cadContainer = document.getElementById("cad-controls-container");
  const namriaContainer = document.getElementById("namria-controls-container");
  const switcher = document.getElementById("stacked-panel-switcher");
  const stackedTabs = switcher.querySelectorAll(".stacked-tab-btn");

  const { activateCad, activateNamria } = initLayerContainer();

  let activePanel = "cad";

  function applyStackedLayout() {
    namriaContainer.classList.add("stacked-mode");
    cadContainer.classList.add("stacked-mode");
    switcher.classList.remove("hidden");
    showStackedPanel(activePanel);
  }

  function showStackedPanel(panel) {
    activePanel = panel;
    if (panel === "cad") {
      cadPanel.classList.remove("hidden");
      namriaPanel.classList.add("hidden");
      activateCad();
    } else {
      namriaPanel.classList.remove("hidden");
      cadPanel.classList.add("hidden");
      activateNamria();
    }
    stackedTabs.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.panel === panel);
    });
  }

  stackedTabs.forEach((btn) => {
    btn.addEventListener("click", () => showStackedPanel(btn.dataset.panel));
  });

  applyStackedLayout();
}
