import { AppState } from "../../config.js";
import { getMap, applyLayerZOrdering } from "./importLayerRenderer.js";
import { makeDragGrip } from "./dragGrip.js";
import {
  openRenameModal,
  openColorModal,
  openDeleteModal,
} from "./importModals.js";

// ── Menu helpers ──────────────────────────────────────────────────────────────

export function closeAllMenus(exceptMenu = null) {
  document.querySelectorAll(".layer-menu-dropdown.open").forEach((m) => {
    if (m !== exceptMenu) {
      m.classList.remove("open");
      if (m._scrollCloseHandler && m._scrollCloseTarget) {
        m._scrollCloseTarget.removeEventListener(
          "scroll",
          m._scrollCloseHandler,
        );
        m._scrollCloseHandler = null;
        m._scrollCloseTarget = null;
      }
    }
  });
}

document.addEventListener("click", () => closeAllMenus(null));

// ── Main render ───────────────────────────────────────────────────────────────

export function updateImportedLayersUI() {
  const listContainer = document.getElementById("imported-layers-list");
  listContainer.innerHTML = "";

  if (AppState.importedLayers.length === 0) {
    listContainer.innerHTML =
      '<div class="empty-state">No custom layers imported yet.</div>';
    return;
  }

  AppState.importedLayers.forEach((layerItem) => {
    listContainer.appendChild(buildLayerItem(layerItem));
  });

  lucide.createIcons();
}

// ── Item builder ──────────────────────────────────────────────────────────────

function buildLayerItem(layerItem) {
  const itemDiv = document.createElement("div");
  itemDiv.className = "imported-layer-item";
  itemDiv.setAttribute("draggable", true);

  attachDragHandlers(itemDiv, layerItem);

  // Row 1: info (handle + checkbox + name + menu)
  const infoDiv = document.createElement("div");
  infoDiv.className = "imported-layer-info";
  infoDiv.appendChild(buildDragHandle());
  infoDiv.appendChild(buildCheckbox(layerItem));
  infoDiv.appendChild(buildMenuWrapper(layerItem));

  // Row 2: style controls
  itemDiv.appendChild(infoDiv);
  itemDiv.appendChild(buildStyleControls(layerItem, itemDiv));
  return itemDiv;
}

// ── Drag handle ───────────────────────────────────────────────────────────────

function buildDragHandle() {
  const el = document.createElement("span");
  el.className = "drag-handle";
  el.title = "Drag to reorder";
  el.innerHTML = '<i data-lucide="grip-vertical"></i>';
  return el;
}

// ── Checkbox ──────────────────────────────────────────────────────────────────

function buildCheckbox(layerItem) {
  // Scoped style for checked-state color
  const styleId = `style-${layerItem.id}`;
  if (!document.getElementById(styleId)) {
    const styleTag = document.createElement("style");
    styleTag.id = styleId;
    styleTag.textContent = `
      [data-layer-id="${layerItem.id}"] input:checked ~ .checkbox-custom {
        background-color: ${layerItem.color};
        border-color: transparent;
      }
    `;
    document.head.appendChild(styleTag);
  }

  const label = document.createElement("label");
  label.className = "control-checkbox";
  label.setAttribute("data-layer-id", layerItem.id);

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = layerItem.checked;
  checkbox.addEventListener("change", (e) => {
    layerItem.checked = e.target.checked;
    const map = getMap();
    if (layerItem.checked) map.addLayer(layerItem.leafletLayer);
    else if (map.hasLayer(layerItem.leafletLayer))
      map.removeLayer(layerItem.leafletLayer);
    applyLayerZOrdering();
  });

  const checkboxCustom = document.createElement("span");
  checkboxCustom.className = "checkbox-custom";
  checkboxCustom.style.borderColor = layerItem.color;

  const nameSpan = document.createElement("span");
  nameSpan.textContent = layerItem.name;
  nameSpan.style.cssText =
    "font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px;";

  const labelWrapper = document.createElement("div");
  labelWrapper.className = "rename-input-wrapper";
  labelWrapper.appendChild(nameSpan);

  label.append(checkbox, checkboxCustom, labelWrapper);
  return label;
}

// ── Style controls (opacity + weight) ────────────────────────────────────────

function buildStyleControls(layerItem, itemDiv) {
  const row = document.createElement("div");
  row.className = "layer-style-controls imported-layer-style-controls";
  row.setAttribute("draggable", "false");
  row.addEventListener("mousedown", (e) => e.stopPropagation());
  row.addEventListener("dragstart", (e) => e.preventDefault());

  row.appendChild(
    buildStyleInput({
      icon: "blend",
      iconClass: "opacity-grip",
      inputClass: "opacity-number-input",
      min: 0,
      max: 100,
      step: 5,
      unit: "%",
      initial: Math.round((layerItem.style.fillOpacity ?? 0.4) * 100),
      onChange: (val) => {
        layerItem.style.fillOpacity = val / 100;
        layerItem.leafletLayer?.setStyle({ fillOpacity: val / 100 });
      },
      onDragActive: (active) => {
        itemDiv.dataset.sliderActive = String(active);
        itemDiv.setAttribute("draggable", !active);
      },
    }),
  );

  row.appendChild(
    buildStyleInput({
      icon: "minus",
      iconClass: "weight-grip",
      inputClass: "weight-number-input",
      min: 0,
      max: 5,
      step: 0.5,
      unit: "px",
      initial: layerItem.style.weight ?? 2.5,
      onChange: (val) => {
        layerItem.style.weight = val;
        layerItem.leafletLayer?.setStyle({ weight: val });
      },
      onDragActive: (active) => {
        itemDiv.dataset.sliderActive = String(active);
        itemDiv.setAttribute("draggable", !active);
      },
    }),
  );

  return row;
}

function buildStyleInput({
  icon,
  iconClass,
  inputClass,
  min,
  max,
  step,
  unit,
  initial,
  onChange,
  onDragActive,
}) {
  const wrapper = document.createElement("div");
  wrapper.className = "style-input";

  const iconEl = document.createElement("i");
  iconEl.setAttribute("data-lucide", icon);
  iconEl.className = `style-input-icon ${iconClass}`;

  const input = document.createElement("input");
  input.type = "number";
  input.className = `style-input-value ${inputClass}`;
  input.min = min;
  input.max = max;
  input.step = step;
  input.value = initial;
  input.setAttribute("draggable", "false");
  input.addEventListener("pointerdown", (e) => e.stopPropagation());
  input.addEventListener("change", () => {
    let val = Math.max(min, Math.min(max, parseFloat(input.value) || 0));
    val = Math.round(val / step) * step;
    input.value = val;
    onChange(val);
  });

  const unitEl = document.createElement("span");
  unitEl.className = "style-input-unit";
  unitEl.textContent = unit;

  makeDragGrip(
    iconEl,
    input,
    min,
    max,
    step,
    (val) => {
      onChange(val);
      onDragActive(true);
    },
    () => onDragActive(false),
  );

  wrapper.append(iconEl, input, unitEl);
  return wrapper;
}

// ── Meatball menu ─────────────────────────────────────────────────────────────

function buildMenuWrapper(layerItem) {
  const wrapper = document.createElement("div");
  wrapper.className = "layer-menu-wrapper";

  const trigger = document.createElement("button");
  trigger.className = "icon-btn layer-menu-trigger";
  trigger.title = "More options";
  trigger.innerHTML = '<i data-lucide="more-horizontal"></i>';

  const dropdown = document.createElement("div");
  dropdown.className = "layer-menu-dropdown";

  const items = [
    {
      label: "Rename",
      handler: () => openRenameModal(layerItem, updateImportedLayersUI),
    },
    {
      label: "Change Color",
      handler: () => openColorModal(layerItem, null, updateImportedLayersUI),
    },
    {
      label: "Delete",
      cls: "layer-menu-item--danger",
      handler: () => openDeleteModal(layerItem),
    },
  ];

  items.forEach(({ label, cls, handler }) => {
    const btn = document.createElement("button");
    btn.className = `layer-menu-item${cls ? ` ${cls}` : ""}`;
    btn.textContent = label;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeAllMenus();
      handler();
    });
    dropdown.appendChild(btn);
  });

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = dropdown.classList.contains("open");
    closeAllMenus();
    if (!isOpen) {
      const rect = trigger.getBoundingClientRect();
      const dropW = 140,
        dropH = 104;
      dropdown.style.top =
        window.innerHeight - rect.bottom < dropH
          ? `${rect.top - dropH - 4}px`
          : `${rect.bottom + 4}px`;
      dropdown.style.left = `${Math.max(4, rect.right - dropW)}px`;
      document.body.appendChild(dropdown);
      dropdown.classList.add("open");

      const scrollTarget = document.querySelector(".panel-content");
      if (scrollTarget) {
        const handler = () => closeAllMenus(null);
        dropdown._scrollCloseHandler = handler;
        dropdown._scrollCloseTarget = scrollTarget;
        scrollTarget.addEventListener("scroll", handler, { once: true });
      }
    }
  });

  wrapper.appendChild(trigger);
  return wrapper;
}

// ── Drag-and-drop reordering ──────────────────────────────────────────────────

function attachDragHandlers(itemDiv, layerItem) {
  itemDiv.addEventListener("dragstart", (e) => {
    if (itemDiv.dataset.sliderActive === "true") {
      e.preventDefault();
      return;
    }
    itemDiv.classList.add("dragging");
    e.dataTransfer.setData("text/plain", layerItem.id);
    e.dataTransfer.effectAllowed = "move";
  });
  itemDiv.addEventListener("dragend", () => {
    itemDiv.classList.remove("dragging");
    document
      .querySelectorAll(".imported-layer-item")
      .forEach((el) => el.classList.remove("drag-over"));
  });
  itemDiv.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (document.querySelector(".dragging") !== itemDiv)
      itemDiv.classList.add("drag-over");
  });
  itemDiv.addEventListener("dragleave", (e) => {
    if (!itemDiv.contains(e.relatedTarget))
      itemDiv.classList.remove("drag-over");
  });
  itemDiv.addEventListener("drop", (e) => {
    e.preventDefault();
    itemDiv.classList.remove("drag-over");
    const draggedId = e.dataTransfer.getData("text/plain");
    if (draggedId !== layerItem.id)
      reorderImportedLayers(draggedId, layerItem.id);
  });
}

function reorderImportedLayers(draggedId, targetId) {
  const draggedIdx = AppState.importedLayers.findIndex(
    (l) => l.id === draggedId,
  );
  const targetIdx = AppState.importedLayers.findIndex((l) => l.id === targetId);
  if (draggedIdx === -1 || targetIdx === -1) return;

  const [item] = AppState.importedLayers.splice(draggedIdx, 1);
  AppState.importedLayers.splice(targetIdx, 0, item);

  applyLayerZOrdering();
  updateImportedLayersUI();
}
