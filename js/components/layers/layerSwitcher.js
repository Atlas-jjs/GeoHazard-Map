// * Add event listener to switch between CADASTRE and NAMRIA Containers
export function initLayerContainer() {
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
