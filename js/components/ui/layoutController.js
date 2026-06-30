export function initLayoutController() {
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
}
