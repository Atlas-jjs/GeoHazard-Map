import { AppState } from "../config.js";
import { shouldProject, projectFeaturesChunked } from "../utils/projection.js";
import {
  getFeatureName,
  highlightFeature,
  showFeatureDetails,
  getHighlightedFeature,
  clearHighlightedFeature,
} from "../components/featureDetails.js";
// import {
//   saveImportedLayerToDB,
//   deleteImportedLayerFromDB,
//   loadImportedLayersFromDB,
// } from "./api.js";
import { buildCodeColorMap } from "../utils/colorUtils.js";

let _map = null;
let pendingImportedData = null;
let pendingFileName = "";

/* *
 * Initialize the import manager with the Leaflet map instance.
 * Sets up all upload/import event listeners.
 * @param {L.Map} map
 */
export function initImportManager(map) {
  _map = map;
  setupImportEventListeners();
}

/* *
 * Restore imported layers from IndexedDB cache on page load.
 */
export async function restoreImportedLayers() {
  try {
    const savedLayers = await loadImportedLayersFromDB();
    if (!savedLayers || savedLayers.length === 0) return;

    // api.js returns sort_order from MySQL; sort ascending before rendering
    savedLayers.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    savedLayers.forEach((savedLayer) => {
      if (savedLayer.needsProjection && savedLayer.data?.features) {
        // Layer was stored in UTM (e.g. ENGP_2011_2025 is EPSG:32651).
        // Re-project coordinates before handing off to renderCustomImportLayer.
        projectFeaturesChunked(savedLayer.data.features, () => {
          renderCustomImportLayer(savedLayer, false);
        });
      } else {
        // Already WGS84 — render directly. Pass false to skip re-saving.
        renderCustomImportLayer(savedLayer, false);
      }
    });

    applyLayerZOrdering();
  } catch (err) {
    console.error("Failed to restore cached layers on startup:", err);
  }
}

// Event Listeners
function setupImportEventListeners() {
  const uploadZone = document.getElementById("upload-zone");
  const fileInput = document.getElementById("file-input");
  const importOptions = document.getElementById("import-options");
  const btnLoadImport = document.getElementById("btn-load-import");
  const layerNameInput = document.getElementById("import-layer-name");
  const layerColorInput = document.getElementById("import-layer-color");
  const colorHex = document.getElementById("color-hex");

  // Update Hex code text representation on color picker change
  layerColorInput.addEventListener("input", (e) => {
    colorHex.textContent = e.target.value.toUpperCase();
  });

  // Open file dialog when clicking the upload zone
  uploadZone.addEventListener("click", () => {
    fileInput.click();
  });

  // Handle dragover states
  ["dragenter", "dragover"].forEach((eventName) => {
    uploadZone.addEventListener(
      eventName,
      (e) => {
        e.preventDefault();
        uploadZone.classList.add("dragover");
      },
      false,
    );
  });

  ["dragleave", "drop"].forEach((eventName) => {
    uploadZone.addEventListener(
      eventName,
      (e) => {
        e.preventDefault();
        uploadZone.classList.remove("dragover");
      },
      false,
    );
  });

  // Handle dropped files
  uploadZone.addEventListener("drop", (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      handleUploadedFile(files[0]);
    }
  });

  // Handle file input changes
  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
      handleUploadedFile(e.target.files[0]);
    }
  });

  // Trigger adding the loaded file to map
  btnLoadImport.addEventListener("click", () => {
    if (!pendingImportedData) return;

    const layerName = layerNameInput.value.trim() || pendingFileName;
    const color = layerColorInput.value;

    addCustomLayerToMap(pendingImportedData, layerName, color);

    // Reset state & hide options card
    pendingImportedData = null;
    pendingFileName = "";
    layerNameInput.value = "";
    importOptions.classList.add("hidden");
  });
}

// File Handling

/* *
 * Read and parse uploaded files (GeoJSON / Zipped Shapefiles).
 */
function handleUploadedFile(file) {
  const name = file.name;
  const ext = name.substring(name.lastIndexOf(".")).toLowerCase();
  pendingFileName = name.substring(0, name.lastIndexOf("."));

  // Autofill filename suggestion
  document.getElementById("import-layer-name").value = pendingFileName;

  // Check for duplicate layer name based on the file name
  const isDuplicate = AppState.importedLayers.some(
    (layer) => layer.name === pendingFileName,
  );

  if (isDuplicate) {
    showDuplicateModal(file, pendingFileName, ext);
    return;
  }

  processFileContent(file, ext);
}

/**
 * Show modal to alert user about duplicate filenames.
 */
function showDuplicateModal(file, name, ext) {
  const modal = document.getElementById("duplicate-modal");
  const nameLabel = document.getElementById("duplicate-layer-name");

  nameLabel.textContent = name;
  modal.classList.remove("hidden");

  const btnReplace = document.getElementById("btn-dup-replace");
  const btnKeep = document.getElementById("btn-dup-keep");
  const btnCancel = document.getElementById("btn-dup-cancel");

  // Clear previous event listeners
  const newReplace = btnReplace.cloneNode(true);
  const newKeep = btnKeep.cloneNode(true);
  const newCancel = btnCancel.cloneNode(true);

  btnReplace.parentNode.replaceChild(newReplace, btnReplace);
  btnKeep.parentNode.replaceChild(newKeep, btnKeep);
  btnCancel.parentNode.replaceChild(newCancel, btnCancel);

  // Replace: removes the older layer and starts loading new file content
  newReplace.addEventListener("click", () => {
    modal.classList.add("hidden");

    document.getElementById("file-input").value = "";
    const dupLayer = AppState.importedLayers.find(
      (layer) => layer.name === name,
    );
    if (dupLayer) {
      removeCustomLayer(dupLayer.id);
    }
    processFileContent(file, ext);
  });

  // Keep Both: Appends auto suffix (e.g. "name (1)") to make the name unique
  newKeep.addEventListener("click", () => {
    modal.classList.add("hidden");

    document.getElementById("file-input").value = "";

    let suffix = 1;
    let uniqueName = `${name} (${suffix})`;
    while (AppState.importedLayers.some((layer) => layer.name === uniqueName)) {
      suffix++;
      uniqueName = `${name} (${suffix})`;
    }
    pendingFileName = uniqueName;
    document.getElementById("import-layer-name").value = uniqueName;
    processFileContent(file, ext);
  });

  // Cancel: resets input
  newCancel.addEventListener("click", () => {
    modal.classList.add("hidden");
    document.getElementById("file-input").value = "";
  });
}

/* *
 * Convert files to GeoJSON via FileReader.
 */
function processFileContent(file, ext) {
  if (ext === ".geojson" || ext === ".json") {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const geojson = JSON.parse(e.target.result);
        pendingImportedData = geojson;

        updateColorPickerVisibility(geojson);

        document.getElementById("import-options").classList.remove("hidden");
      } catch (err) {
        alert("Failed to parse GeoJSON: " + err.message);
      }
    };
    reader.readAsText(file);
  } else if (ext === ".zip") {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const buffer = e.target.result;
        const geojson = await shp(buffer);
        pendingImportedData = geojson;

        updateColorPickerVisibility(geojson);

        document.getElementById("import-options").classList.remove("hidden");
      } catch (err) {
        alert(
          "Failed to parse shapefile archive. Ensure the .zip contains .shp and .dbf files.\nDetails: " +
            err.message,
        );
      }
    };
    reader.readAsArrayBuffer(file);
  } else {
    alert(
      "Unsupported file format. Please upload a .geojson, .json, or zipped shapefile (.zip).",
    );
  }
}

function updateColorPickerVisibility(geojson) {
  const hasCode =
    geojson.features?.length &&
    "CODE" in (geojson.features[0]?.properties ?? {});

  const colorField = document
    .getElementById("import-layer-color")
    .closest(".option-field");

  if (hasCode) {
    colorField.style.display = "none";
  } else {
    colorField.style.display = "";
  }
}

// Layer Creation & Rendering

/* *
 * Convert layer projection if UTM and place on Leaflet map.
 */
function addCustomLayerToMap(geojson, name, color) {
  const id = "custom-" + Date.now();

  const codeColorMap = buildCodeColorMap(geojson);

  const style = {
    color: color,
    weight: 2.5,
    fillOpacity: 0.15,
    fillColor: color,
  };

  const customLayerItem = {
    id: id,
    name: name,
    color: color,
    data: geojson,
    codeColorMap,
    leafletLayer: null,
    checked: true,
    style: style,
  };

  if (shouldProject(geojson)) {
    // saveToDb fires inside the callback (default true) so the stored
    // GeoJSON already contains WGS84 coordinates, not raw UTM values.
    projectFeaturesChunked(geojson.features, () => {
      renderCustomImportLayer(customLayerItem, true);
    });
  } else {
    renderCustomImportLayer(customLayerItem, true);
  }
}

/* *
 * Draw custom layer and bind interactions (with optional saving to DB cache).
 */
function renderCustomImportLayer(layerItem, saveToDb = true) {
  const codeColorMap = layerItem.codeColorMap ?? null;

  layerItem.leafletLayer = L.geoJSON(layerItem.data, {
    style: codeColorMap
      ? (feature) => {
          const code = String(feature.properties?.CODE ?? "");
          const color = codeColorMap[code] ?? layerItem.style.color;
          return { ...layerItem.style, color, fillColor: color };
        }
      : layerItem.style,
    onEachFeature: (feature, layer) => {
      layer.on({
        mouseover: (e) => {
          const l = e.target;

          const featureColor = codeColorMap
            ? (codeColorMap[String(feature.properties?.CODE ?? "")] ??
              layerItem.style.color)
            : layerItem.style.color;

          l.setStyle({
            weight: layerItem.style.weight + 1,
            color: "#ffffff",
            fillOpacity: Math.min(layerItem.style.fillOpacity + 0.15, 0.7),
          });

          let name = getFeatureName(feature.properties, "");
          if (name) {
            l.bindTooltip(name, {
              sticky: true,
              className: "premium-tooltip",
            }).openTooltip();
          }
        },
        mouseout: (e) => {
          layerItem.leafletLayer.resetStyle(e.target);
        },
        click: (e) => {
          if (e.target.getBounds) {
            _map.fitBounds(e.target.getBounds());
          }
          highlightFeature(e.target);
          showFeatureDetails(feature.properties, layerItem.name);
        },
      });
    },
  });

  // Add to map if checked
  if (layerItem.checked) {
    _map.addLayer(layerItem.leafletLayer);
  }

  // Store in AppState
  AppState.importedLayers.push(layerItem);

  // Save to IndexedDB if it's a fresh upload
  if (saveToDb) {
    persistLayerToDB(layerItem);
  }

  // Align visual z-ordering
  applyLayerZOrdering();

  // Refresh controls tab listing
  updateImportedLayersUI();
}

// UI List Management

/* *
 * Close every open meatball menu except the one specified.
 * Pass null to close all of them.
 * @param {HTMLElement|null} exceptMenu
 */
function closeAllMenus(exceptMenu = null) {
  document.querySelectorAll(".layer-menu-dropdown.open").forEach((m) => {
    if (m !== exceptMenu) m.classList.remove("open");
  });
}

// Close open menus when clicking anywhere outside them
document.addEventListener("click", () => closeAllMenus(null));

/* *
 * One-time stylesheet for the horizontal meatball flyout. Injected with
 * !important + an ID-scoped selector so it wins over whatever layout the
 * original (vertical, text-label) .layer-menu-dropdown rules used.
 */
function injectHorizontalMenuStyles() {
  if (document.getElementById("horizontal-layer-menu-styles")) return;

  const styleTag = document.createElement("style");
  styleTag.id = "horizontal-layer-menu-styles";
  styleTag.textContent = `
    #imported-layers-list .layer-menu-dropdown {
      display: none !important;
      flex-direction: row !important;
      align-items: center !important;
      gap: 4px !important;
      position: absolute !important;
      top: calc(100% + 6px) !important;
      right: 0 !important;
      left: auto !important;
      background: #ffffff !important;
      border: 1px solid #e2e2e2 !important;
      border-radius: 8px !important;
      padding: 4px !important;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.14) !important;
      z-index: 50 !important;
      white-space: nowrap !important;
    }
    #imported-layers-list .layer-menu-dropdown.open {
      display: flex !important;
    }
    #imported-layers-list .layer-menu-item {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      height: 30px !important;
      padding: 0 10px !important;
      margin: 0 !important;
      border: none !important;
      background: transparent !important;
      border-radius: 6px !important;
      cursor: pointer !important;
      color: inherit !important;
      font-size: 12px !important;
      font-weight: 500 !important;
      white-space: nowrap !important;
    }
    #imported-layers-list .layer-menu-item:hover {
      background: rgba(0, 0, 0, 0.07) !important;
    }
    #imported-layers-list .layer-menu-item--danger:hover {
      background: rgba(220, 38, 38, 0.12) !important;
      color: #dc2626 !important;
    }
  `;
  document.head.appendChild(styleTag);
}

/* *
 * Synchronize tab list displaying imported layers with drag-and-drop reordering.
 * Each row has:
 *   • drag handle (locked while opacity slider is active)
 *   • colored checkbox + layer name
 *   • fill-opacity slider (disables dragging while in use)
 *   • ⋯ meatball menu (horizontal flyout) → Edit Color | Rename | Delete
 */
function updateImportedLayersUI() {
  injectHorizontalMenuStyles();

  const listContainer = document.getElementById("imported-layers-list");
  listContainer.innerHTML = "";

  if (AppState.importedLayers.length === 0) {
    listContainer.innerHTML =
      '<div class="empty-state">No custom layers imported yet.</div>';
    return;
  }

  AppState.importedLayers.forEach((layerItem) => {
    const itemDiv = document.createElement("div");
    itemDiv.className = "imported-layer-item";
    itemDiv.setAttribute("draggable", true);

    // ── Drag-and-Drop ──────────────────────────────────────
    itemDiv.addEventListener("dragstart", (e) => {
      // Block drag while the opacity slider is being adjusted
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
      document.querySelectorAll(".imported-layer-item").forEach((el) => {
        el.classList.remove("drag-over");
      });
    });
    itemDiv.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const draggingEl = document.querySelector(".dragging");
      if (draggingEl && draggingEl !== itemDiv) {
        itemDiv.classList.add("drag-over");
      }
    });
    itemDiv.addEventListener("dragleave", () => {
      itemDiv.classList.remove("drag-over");
    });
    itemDiv.addEventListener("drop", (e) => {
      e.preventDefault();
      itemDiv.classList.remove("drag-over");
      const draggedId = e.dataTransfer.getData("text/plain");
      if (draggedId !== layerItem.id) {
        reorderImportedLayers(draggedId, layerItem.id);
      }
    });

    // ── Info row ────────────────────────────────────────────
    const infoDiv = document.createElement("div");
    infoDiv.className = "imported-layer-info";

    // Drag handle
    const dragHandle = document.createElement("span");
    dragHandle.className = "drag-handle";
    dragHandle.title = "Drag to reorder";
    dragHandle.innerHTML = '<i data-lucide="grip-vertical"></i>';

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

    // Checkbox
    const checkboxLabel = document.createElement("label");
    checkboxLabel.className = "control-checkbox";
    checkboxLabel.setAttribute("data-layer-id", layerItem.id);

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = layerItem.checked;
    checkbox.addEventListener("change", (e) => {
      layerItem.checked = e.target.checked;
      if (layerItem.checked) {
        _map.addLayer(layerItem.leafletLayer);
      } else {
        if (_map.hasLayer(layerItem.leafletLayer)) {
          _map.removeLayer(layerItem.leafletLayer);
        }
      }
      applyLayerZOrdering();
      persistLayerToDB(layerItem);
    });

    const checkboxCustom = document.createElement("span");
    checkboxCustom.className = "checkbox-custom";
    checkboxCustom.style.borderColor = layerItem.color;

    // Layer name (editable via meatball menu)
    const labelWrapper = document.createElement("div");
    labelWrapper.className = "rename-input-wrapper";

    const nameSpan = document.createElement("span");
    nameSpan.textContent = layerItem.name;
    nameSpan.style.cssText =
      "font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px;";
    labelWrapper.appendChild(nameSpan);

    checkboxLabel.appendChild(checkbox);
    checkboxLabel.appendChild(checkboxCustom);
    checkboxLabel.appendChild(labelWrapper);
    infoDiv.appendChild(dragHandle);
    infoDiv.appendChild(checkboxLabel);

    // ── Fill-Opacity Slider ──────────────────────────────────
    const opacityTemplate = document.getElementById("opacity-slider-template");
    const opacityWrapper =
      opacityTemplate.content.firstElementChild.cloneNode(true);

    const opacitySlider = opacityWrapper.querySelector(".opacity-slider"); // ? input
    const opacityValue = opacityWrapper.querySelector(".opacity-value"); // ? span

    const initialOpacity = layerItem.style.fillOpacity ?? 0.15;
    opacitySlider.value = initialOpacity;
    opacitySlider.setAttribute(
      "aria-label",
      `Fill opacity for ${layerItem.name}`,
    );
    opacityValue.textContent = `${Math.round(initialOpacity * 100)}%`;

    // Lock dragging while slider thumb is held down
    opacitySlider.addEventListener("mousedown", () => {
      itemDiv.dataset.sliderActive = "true";
      itemDiv.setAttribute("draggable", false);
    });
    opacitySlider.addEventListener(
      "touchstart",
      () => {
        itemDiv.dataset.sliderActive = "true";
        itemDiv.setAttribute("draggable", false);
      },
      { passive: true },
    );
    const unlockDrag = () => {
      itemDiv.dataset.sliderActive = "false";
      itemDiv.setAttribute("draggable", true);
    };
    opacitySlider.addEventListener("mouseup", unlockDrag);
    opacitySlider.addEventListener("touchend", unlockDrag);

    // Shift+scroll wheel shortcut
    opacitySlider.addEventListener("wheel", (e) => {
      if (!e.shiftKey) return;
      e.preventDefault();
      const step = parseFloat(opacitySlider.step);
      let val = parseFloat(opacitySlider.value) + (e.deltaY < 0 ? step : -step);
      val = Math.max(0, Math.min(1, val));
      opacitySlider.value = val.toFixed(2);
      opacitySlider.dispatchEvent(new Event("input"));
    });

    // Live update — no DB write on every tick
    opacitySlider.addEventListener("input", (e) => {
      const newOpacity = parseFloat(e.target.value);
      layerItem.style.fillOpacity = newOpacity;
      opacityValue.textContent = `${Math.round(newOpacity * 100)}%`;
      if (layerItem.leafletLayer) {
        layerItem.leafletLayer.setStyle({ fillOpacity: newOpacity });
      }
    });

    // Persist only once the user releases
    opacitySlider.addEventListener("change", () => {
      persistLayerToDB(layerItem);
    });

    infoDiv.appendChild(opacityWrapper);

    // ── Meatball menu (⋯) — horizontal icon flyout ───────────
    const menuWrapper = document.createElement("div");
    menuWrapper.className = "layer-menu-wrapper";
    menuWrapper.style.position = "relative";

    const menuTrigger = document.createElement("button");
    menuTrigger.className = "icon-btn layer-menu-trigger";
    menuTrigger.title = "More options";
    menuTrigger.innerHTML = '<i data-lucide="more-horizontal"></i>';

    const menuDropdown = document.createElement("div");
    menuDropdown.className = "layer-menu-dropdown";

    // — Edit Color —
    const btnColor = document.createElement("button");
    btnColor.className = "layer-menu-item";
    btnColor.textContent = "Edit Color";
    btnColor.addEventListener("click", (e) => {
      e.stopPropagation();
      closeAllMenus();

      const rect = btnColor.getBoundingClientRect();

      const colorPicker = document.createElement("input");
      colorPicker.type = "color";
      colorPicker.value = layerItem.color;
      colorPicker.style.cssText = `
    position: fixed;
    top: ${rect.top}px;
    left: ${rect.left}px;
    width: ${rect.width}px;
    height: ${rect.height}px;
    opacity: 0;
    pointer-events: none;
  `;
      document.body.appendChild(colorPicker);
      colorPicker.click();

      colorPicker.addEventListener("input", (ev) => {
        const newColor = ev.target.value;
        layerItem.color = newColor;
        layerItem.style.color = newColor;
        layerItem.style.fillColor = newColor;

        // If this layer was using a per-CODE palette, collapse it into the
        // single chosen color. Mutating the existing object in place (rather
        // than reassigning/nulling it) keeps Leaflet's hover/resetStyle
        // closure in sync, since that closure still points at this same
        // codeColorMap reference.
        if (layerItem.codeColorMap) {
          Object.keys(layerItem.codeColorMap).forEach((code) => {
            layerItem.codeColorMap[code] = newColor;
          });
        }

        // Re-render the Leaflet layer with the new color
        if (layerItem.leafletLayer) {
          layerItem.leafletLayer.setStyle({
            ...layerItem.style,
            color: newColor,
            fillColor: newColor,
          });
        }

        // Live-update the checkbox border color without a full re-render
        checkboxCustom.style.borderColor = newColor;
      });

      colorPicker.addEventListener("change", () => {
        persistLayerToDB(layerItem);
        document.body.removeChild(colorPicker);
        // Refresh UI to sync the swatch/hex in the list
        updateImportedLayersUI();
      });

      colorPicker.addEventListener("blur", () => {
        // Cleanup if the picker closes without a change event
        if (document.body.contains(colorPicker)) {
          document.body.removeChild(colorPicker);
        }
      });
    });

    // — Rename —
    const btnRename = document.createElement("button");
    btnRename.className = "layer-menu-item";
    btnRename.textContent = "Rename";
    btnRename.addEventListener("click", (e) => {
      e.stopPropagation();
      closeAllMenus();

      if (labelWrapper.querySelector(".rename-input")) return;
      labelWrapper.innerHTML = "";

      const input = document.createElement("input");
      input.type = "text";
      input.className = "rename-input";
      input.value = layerItem.name;
      labelWrapper.appendChild(input);
      input.focus();
      input.select();

      opacitySlider.disabled = true;

      let saved = false;
      let modalOpen = false;

      const saveRename = () => {
        if (saved || modalOpen) return;
        const newName = input.value.trim();
        if (newName && newName !== layerItem.name) {
          if (
            AppState.importedLayers.some(
              (layer) => layer.name === newName && layer.id !== layerItem.id,
            )
          ) {
            modalOpen = true;
            const modal = document.getElementById("rename-error-modal");
            const nameEl = document.getElementById("rename-error-name");
            const okBtn = document.getElementById("btn-rename-error-ok");
            nameEl.textContent = newName;
            modal.classList.remove("hidden");
            lucide.createIcons();
            const onOk = () => {
              modal.classList.add("hidden");
              modalOpen = false;
              okBtn.removeEventListener("click", onOk);
              input.focus();
              input.select();
            };
            okBtn.addEventListener("click", onOk);
            return;
          }
          layerItem.name = newName;
          persistLayerToDB(layerItem);
        }
        updateImportedLayersUI();
      };

      const cancelRename = () => {
        if (saved) return;
        saved = true;
        updateImportedLayersUI();
      };

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") saveRename();
        if (e.key === "Escape") cancelRename();
      });
      input.addEventListener("blur", saveRename);
    });

    // — Delete —
    const btnDelete = document.createElement("button");
    btnDelete.className = "layer-menu-item layer-menu-item--danger";
    btnDelete.textContent = "Delete";
    btnDelete.addEventListener("click", (e) => {
      e.stopPropagation();
      closeAllMenus();
      removeCustomLayer(layerItem.id);
    });

    menuDropdown.appendChild(btnColor);
    menuDropdown.appendChild(btnRename);
    menuDropdown.appendChild(btnDelete);

    // Toggle open/close
    menuTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = menuDropdown.classList.contains("open");
      closeAllMenus();
      if (!isOpen) menuDropdown.classList.add("open");
    });

    menuWrapper.appendChild(menuTrigger);
    menuWrapper.appendChild(menuDropdown);

    itemDiv.appendChild(infoDiv);
    itemDiv.appendChild(menuWrapper);
    listContainer.appendChild(itemDiv);
  });

  lucide.createIcons();
}

// Layer Ordering

/* *
 * Adjust imported layers array order after drag-and-drop.
 */
function reorderImportedLayers(draggedId, targetId) {
  const draggedIdx = AppState.importedLayers.findIndex(
    (l) => l.id === draggedId,
  );
  const targetIdx = AppState.importedLayers.findIndex((l) => l.id === targetId);

  if (draggedIdx === -1 || targetIdx === -1) return;

  const [draggedItem] = AppState.importedLayers.splice(draggedIdx, 1);
  AppState.importedLayers.splice(targetIdx, 0, draggedItem);

  // Re-align z-indexing on Leaflet Map
  applyLayerZOrdering();

  // Save new indexes order database config
  saveAllImportedLayersToDB();

  // Refresh DOM
  updateImportedLayersUI();
}

/* *
 * Bring Leaflet layers to front in reverse list order
 * to make the top of the list stack on top.
 */
function applyLayerZOrdering() {
  for (let i = AppState.importedLayers.length - 1; i >= 0; i--) {
    const layerItem = AppState.importedLayers[i];
    if (
      layerItem.leafletLayer &&
      layerItem.checked &&
      _map.hasLayer(layerItem.leafletLayer)
    ) {
      layerItem.leafletLayer.bringToFront();
    }
  }
}

// Layer Removal

/* *
 * Remove custom GeoJSON/Shapefile from memory, map, UI, and DB cache.
 */
function removeCustomLayer(id) {
  const index = AppState.importedLayers.findIndex((item) => item.id === id);
  if (index === -1) return;

  const layerItem = AppState.importedLayers[index];

  // Remove layer from Leaflet
  if (layerItem.leafletLayer && _map.hasLayer(layerItem.leafletLayer)) {
    _map.removeLayer(layerItem.leafletLayer);
  }

  // Remove registry entry
  AppState.importedLayers.splice(index, 1);

  // DB persistence is currently disabled (see persistLayerToDB) — skip cache delete too
  // deleteImportedLayerFromDB(id);

  // Close features metadata panel if details belong to the deleted dataset
  const highlighted = getHighlightedFeature();
  if (
    highlighted &&
    layerItem.leafletLayer &&
    layerItem.leafletLayer.hasLayer(highlighted)
  ) {
    document.getElementById("details-panel").classList.add("hidden");
    clearHighlightedFeature();
  }

  // Redraw list container
  updateImportedLayersUI();
}
// Database Helpers

/* *
 * Persist a layer to IndexedDB with its current order index.
 */
function persistLayerToDB(layerItem) {
  // const order = AppState.importedLayers.findIndex((l) => l.id === layerItem.id);
  // saveImportedLayerToDB(layerItem, order);
}

/* *
 * Save all imported layers with their current index order to IndexedDB.
 */
function saveAllImportedLayersToDB() {
  // AppState.importedLayers.forEach((layerItem) => {
  //   persistLayerToDB(layerItem);
  // });
}
