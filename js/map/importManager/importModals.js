import { AppState } from "../../config.js";
import { removeCustomLayer } from "./importLayerRenderer.js";

// ── Duplicate filename modal ──────────────────────────────────────────────────

export function showDuplicateModal(file, name, ext, onReplace, onKeep) {
  const modal = document.getElementById("duplicate-modal");
  document.getElementById("duplicate-layer-name").textContent = name;
  modal.classList.remove("hidden");

  // Clone buttons to wipe prior listeners
  ["btn-dup-replace", "btn-dup-keep", "btn-dup-cancel"].forEach((id) => {
    const el = document.getElementById(id);
    el.parentNode.replaceChild(el.cloneNode(true), el);
  });

  document.getElementById("btn-dup-replace").addEventListener("click", () => {
    modal.classList.add("hidden");
    document.getElementById("file-input").value = "";
    onReplace();
  });

  document.getElementById("btn-dup-keep").addEventListener("click", () => {
    modal.classList.add("hidden");
    document.getElementById("file-input").value = "";
    onKeep();
  });

  document.getElementById("btn-dup-cancel").addEventListener("click", () => {
    modal.classList.add("hidden");
    document.getElementById("file-input").value = "";
  });
}

// ── Rename modal ──────────────────────────────────────────────────────────────

export function openRenameModal(layerItem, onSuccess) {
  const modal = document.getElementById("layer-rename-modal");
  const input = document.getElementById("layer-rename-input");

  input.value = layerItem.name;
  modal.classList.remove("hidden");
  lucide.createIcons();
  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });

  const oldSave = document.getElementById("btn-rename-save");
  const oldCancel = document.getElementById("btn-rename-cancel");
  const btnSave = oldSave.cloneNode(true);
  const btnCancel = oldCancel.cloneNode(true);
  oldSave.replaceWith(btnSave);
  oldCancel.replaceWith(btnCancel);

  const close = () => modal.classList.add("hidden");

  const save = () => {
    const newName = input.value.trim();
    if (!newName) {
      close();
      return;
    }

    if (newName !== layerItem.name) {
      const isDuplicate = AppState.importedLayers.some(
        (l) => l.name === newName && l.id !== layerItem.id,
      );
      if (isDuplicate) {
        showRenameErrorModal(newName, () => {
          requestAnimationFrame(() => {
            input.focus();
            input.select();
          });
        });
        return;
      }
      layerItem.name = newName;
    }
    close();
    onSuccess?.();
  };

  btnSave.addEventListener("click", save);
  btnCancel.addEventListener("click", close);
  input.addEventListener("keydown", function onKey(e) {
    if (e.key === "Enter") {
      save();
      input.removeEventListener("keydown", onKey);
    }
    if (e.key === "Escape") {
      close();
      input.removeEventListener("keydown", onKey);
    }
  });
}

function showRenameErrorModal(name, onOk) {
  const errModal = document.getElementById("rename-error-modal");
  document.getElementById("rename-error-name").textContent = name;
  errModal.classList.remove("hidden");
  lucide.createIcons();
  const okBtn = document.getElementById("btn-rename-error-ok");
  const newOk = okBtn.cloneNode(true);
  okBtn.replaceWith(newOk);
  newOk.addEventListener("click", () => {
    errModal.classList.add("hidden");
    onOk?.();
  });
}

// ── Change Color modal ────────────────────────────────────────────────────────

export function openColorModal(layerItem, checkboxCustomEl, onSuccess) {
  const modal = document.getElementById("layer-color-modal");
  const picker = document.getElementById("layer-color-picker");
  const hexSpan = document.getElementById("layer-color-hex");

  picker.value = layerItem.color;
  hexSpan.textContent = layerItem.color.toUpperCase();
  modal.classList.remove("hidden");
  lucide.createIcons();

  const oldApply = document.getElementById("btn-color-apply");
  const oldCancel = document.getElementById("btn-color-cancel");
  const btnApply = oldApply.cloneNode(true);
  const btnCancel = oldCancel.cloneNode(true);
  oldApply.replaceWith(btnApply);
  oldCancel.replaceWith(btnCancel);

  const onPickerInput = (e) => {
    hexSpan.textContent = e.target.value.toUpperCase();
  };
  picker.addEventListener("input", onPickerInput);

  const close = () => {
    modal.classList.add("hidden");
    picker.removeEventListener("input", onPickerInput);
  };

  btnApply.addEventListener("click", () => {
    const newColor = picker.value;
    layerItem.color = newColor;
    layerItem.style.color = newColor;
    layerItem.style.fillColor = newColor;

    if (layerItem.codeColorMap) {
      Object.keys(layerItem.codeColorMap).forEach((code) => {
        layerItem.codeColorMap[code] = newColor;
      });
    }
    if (layerItem.leafletLayer) {
      layerItem.leafletLayer.setStyle({
        ...layerItem.style,
        color: newColor,
        fillColor: newColor,
      });
    }
    if (checkboxCustomEl) checkboxCustomEl.style.borderColor = newColor;

    close();
    onSuccess?.();
  });

  btnCancel.addEventListener("click", close);
}

// ── Delete confirmation modal ─────────────────────────────────────────────────

export function openDeleteModal(layerItem) {
  const modal = document.getElementById("layer-delete-modal");
  document.getElementById("delete-layer-name").textContent = layerItem.name;
  modal.classList.remove("hidden");
  lucide.createIcons();

  const oldConfirm = document.getElementById("btn-delete-confirm");
  const oldCancel = document.getElementById("btn-delete-cancel");
  const btnConfirm = oldConfirm.cloneNode(true);
  const btnCancel = oldCancel.cloneNode(true);
  oldConfirm.replaceWith(btnConfirm);
  oldCancel.replaceWith(btnCancel);

  const close = () => modal.classList.add("hidden");
  btnConfirm.addEventListener("click", () => {
    close();
    removeCustomLayer(layerItem.id);
  });
  btnCancel.addEventListener("click", close);
}
