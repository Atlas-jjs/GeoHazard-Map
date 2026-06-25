import { AppState } from "../../config.js";
import {
  addCustomLayerToMap,
  removeCustomLayer,
  setMap,
} from "./importLayerRenderer.js";
import { showDuplicateModal } from "./importModals.js";

let pendingImportedData = null;
let pendingFileName = "";

// ── Init ──────────────────────────────────────────────────────────────────────

export function initImportManager(map) {
  setMap(map);
  setupImportEventListeners();
}

// ── Event Listeners ───────────────────────────────────────────────────────────

function setupImportEventListeners() {
  const uploadZone = document.getElementById("upload-zone");
  const fileInput = document.getElementById("file-input");
  const importOptions = document.getElementById("import-options");
  const btnLoadImport = document.getElementById("btn-load-import");
  const layerNameInput = document.getElementById("import-layer-name");
  const layerColorInput = document.getElementById("import-layer-color");
  const colorHex = document.getElementById("color-hex");

  layerColorInput.addEventListener("input", (e) => {
    colorHex.textContent = e.target.value.toUpperCase();
  });

  uploadZone.addEventListener("click", () => {
    if (uploadZone.dataset.loading !== "true") fileInput.click();
  });

  ["dragenter", "dragover"].forEach((ev) =>
    uploadZone.addEventListener(
      ev,
      (e) => {
        e.preventDefault();
        uploadZone.classList.add("dragover");
      },
      false,
    ),
  );
  ["dragleave", "drop"].forEach((ev) =>
    uploadZone.addEventListener(
      ev,
      (e) => {
        e.preventDefault();
        uploadZone.classList.remove("dragover");
      },
      false,
    ),
  );

  uploadZone.addEventListener("drop", (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) handleUploadedFile(files[0]);
  });

  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) handleUploadedFile(e.target.files[0]);
  });

  btnLoadImport.addEventListener("click", () => {
    if (!pendingImportedData) return;
    const layerName = layerNameInput.value.trim() || pendingFileName;
    addCustomLayerToMap(pendingImportedData, layerName, layerColorInput.value);
    pendingImportedData = null;
    pendingFileName = "";
    layerNameInput.value = "";
    importOptions.classList.add("hidden");
  });
}

// ── File Handling ─────────────────────────────────────────────────────────────

function handleUploadedFile(file) {
  const { name } = file;
  const ext = name.substring(name.lastIndexOf(".")).toLowerCase();
  pendingFileName = name.substring(0, name.lastIndexOf("."));
  document.getElementById("import-layer-name").value = pendingFileName;

  const isDuplicate = AppState.importedLayers.some(
    (l) => l.name === pendingFileName,
  );
  if (isDuplicate) {
    showDuplicateModal(
      file,
      pendingFileName,
      ext,
      // Replace
      () => {
        const dup = AppState.importedLayers.find(
          (l) => l.name === pendingFileName,
        );
        if (dup) removeCustomLayer(dup.id);
        processFileContent(file, ext);
      },
      // Keep Both
      () => {
        let suffix = 1;
        let uniqueName = `${pendingFileName} (${suffix})`;
        while (AppState.importedLayers.some((l) => l.name === uniqueName)) {
          uniqueName = `${pendingFileName} (${++suffix})`;
        }
        pendingFileName = uniqueName;
        document.getElementById("import-layer-name").value = uniqueName;
        processFileContent(file, ext);
      },
    );
    return;
  }

  processFileContent(file, ext);
}

function processFileContent(file, ext) {
  if (ext === ".geojson" || ext === ".json") {
    showImportSpinner();
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        pendingImportedData = JSON.parse(e.target.result);
        updateColorPickerVisibility(pendingImportedData);
        document.getElementById("import-options").classList.remove("hidden");
      } catch (err) {
        alert("Failed to parse GeoJSON: " + err.message);
      } finally {
        hideImportSpinner();
      }
    };
    reader.onerror = hideImportSpinner;
    reader.readAsText(file);
  } else if (ext === ".zip") {
    showImportSpinner();
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        pendingImportedData = await shp(e.target.result);
        updateColorPickerVisibility(pendingImportedData);
        document.getElementById("import-options").classList.remove("hidden");
      } catch (err) {
        alert(
          "Failed to parse shapefile archive. Ensure the .zip contains .shp and .dbf files.\nDetails: " +
            err.message,
        );
      } finally {
        hideImportSpinner();
      }
    };
    reader.onerror = hideImportSpinner;
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
  colorField.style.display = hasCode ? "none" : "";
}

// ── Spinner ───────────────────────────────────────────────────────────────────

function showImportSpinner() {
  const z = document.getElementById("upload-zone");
  if (z) {
    z.classList.add("upload-loading");
    z.dataset.loading = "true";
  }
}

function hideImportSpinner() {
  const z = document.getElementById("upload-zone");
  if (z) {
    z.classList.remove("upload-loading");
    z.dataset.loading = "false";
  }
}
