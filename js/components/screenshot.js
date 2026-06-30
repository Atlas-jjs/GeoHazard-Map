// * === Screenshot Component ===

let _capturedCanvas = null;

export function initScreenshot(map) {
  const screenshotBtn = document.getElementById("btn-screenshot");
  const closePreviewBtn = document.getElementById("btn-close-preview");
  const downloadBtn = document.getElementById("btn-download-screenshot");
  const previewModal = document.getElementById("screenshot-preview-modal");

  screenshotBtn?.addEventListener("click", () => captureWithMap(map));

  closePreviewBtn?.addEventListener("click", () => {
    previewModal.classList.add("hidden");
    _capturedCanvas = null;
  });

  downloadBtn?.addEventListener("click", () => {
    if (!_capturedCanvas) return;
    const timestamp = new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[:.]/g, "-");
    const link = document.createElement("a");
    link.download = `DENR-CAR_Layers_-${timestamp}.png`;
    link.href = _capturedCanvas.toDataURL("image/png");
    link.click();
  });

  previewModal?.addEventListener("click", (e) => {
    if (e.target === previewModal) {
      previewModal.classList.add("hidden");
      _capturedCanvas = null;
    }
  });
}

// * Tile-pane fix  (Problem A)

function getLeafletPos(el) {
  if (el?._leaflet_pos) return { x: el._leaflet_pos.x, y: el._leaflet_pos.y };
  const m = (el?.style?.transform ?? "").match(
    /translate(?:3d)?\(\s*([-\d.]+)px[,\s]+([-\d.]+)px/,
  );
  return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 0, y: 0 };
}

function fixTilesForCapture(map) {
  const { mapPane, tilePane } = map.getPanes();
  const { x: dx, y: dy } = getLeafletPos(mapPane);
  const savedTransform = mapPane.style.transform;
  const tiles = Array.from(tilePane?.querySelectorAll(".leaflet-tile") ?? []);
  const saved = tiles.map((t) => ({
    el: t,
    left: t.style.left,
    top: t.style.top,
  }));

  mapPane.style.transform = "translate3d(0px,0px,0px)";
  tiles.forEach((t) => {
    t.style.left = `${(parseFloat(t.style.left) || 0) + dx}px`;
    t.style.top = `${(parseFloat(t.style.top) || 0) + dy}px`;
  });

  return () => {
    mapPane.style.transform = savedTransform;
    saved.forEach(({ el, left, top }) => {
      el.style.left = left;
      el.style.top = top;
    });
  };
}

// * SVG overlay → canvas  (Problem B)

async function drawSvgOverlayOntoCanvas(map, destCanvas, DPR) {
  const renderer = map._renderer;
  if (!renderer?._container || !renderer._bounds || !renderer._svgSize) return;

  const {
    min: { x: minX, y: minY },
  } = renderer._bounds;
  const { x: w, y: h } = renderer._svgSize;
  const panOffset = getLeafletPos(map.getPanes().mapPane);
  const { left, top } = map.getContainer().getBoundingClientRect();

  const clone = renderer._container.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", w);
  clone.setAttribute("height", h);
  clone.style.transform = "";

  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(clone)], {
      type: "image/svg+xml;charset=utf-8",
    }),
  );

  await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      destCanvas
        .getContext("2d")
        .drawImage(
          img,
          (left + panOffset.x + minX) * DPR,
          (top + panOffset.y + minY) * DPR,
          w * DPR,
          h * DPR,
        );
      URL.revokeObjectURL(url);
      resolve();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    img.src = url;
  });
}

// * Stamp helpers

function stampBadge(ctx, canvas, DPR, text, alignRight = false) {
  const fontPx = Math.round(12 * DPR);
  const padX = Math.round(14 * DPR);
  const padY = Math.round(10 * DPR);
  const barHeight = Math.round(36 * DPR);
  const rad = Math.round(6 * DPR);

  ctx.font = `italic ${fontPx}px Inter, sans-serif`;

  const barW = ctx.measureText(text).width + padX * 2;
  const barX = alignRight
    ? canvas.width - barW - Math.round(padX / 2)
    : Math.round(padX / 2);
  const barY = canvas.height - barHeight;

  // Rounded rect background
  ctx.fillStyle = "rgba(9, 13, 22, 0.82)";
  ctx.beginPath();
  ctx.moveTo(barX + rad, barY);
  ctx.lineTo(barX + barW - rad, barY);
  ctx.quadraticCurveTo(barX + barW, barY, barX + barW, barY + rad);
  ctx.lineTo(barX + barW, barY + barHeight - rad);
  ctx.quadraticCurveTo(
    barX + barW,
    barY + barHeight,
    barX + barW - rad,
    barY + barHeight,
  );
  ctx.lineTo(barX + rad, barY + barHeight);
  ctx.quadraticCurveTo(barX, barY + barHeight, barX, barY + barHeight - rad);
  ctx.lineTo(barX, barY + rad);
  ctx.quadraticCurveTo(barX, barY, barX + rad, barY);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
  ctx.fillText(text, barX + padX, barY + padY + fontPx);
}

function stampDisclaimer(ctx, canvas, DPR) {
  stampBadge(
    ctx,
    canvas,
    DPR,
    "Disclaimer: This map is not intended to replace any official data but is for planning purposes only. Not for legal or navigational use.",
  );
}

function stampDateTime(ctx, canvas, DPR) {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  stampBadge(ctx, canvas, DPR, `Captured: ${dateStr} · ${timeStr}`, true);
}

// * Panel capture helper  (Problem C — fixed panel layering)

async function drawDetailsPanelOntoCanvas(destCanvas, DPR) {
  const panel = document.getElementById("details-panel");
  if (!panel || panel.classList.contains("hidden")) return;

  panel.style.position = "absolute";
  const panelCanvas = await html2canvas(panel, {
    useCORS: true,
    allowTaint: true,
    scale: DPR,
    logging: false,
    backgroundColor: null,
  });
  panel.style.position = "";

  const { left, top } = panel.getBoundingClientRect();
  destCanvas.getContext("2d").drawImage(panelCanvas, left * DPR, top * DPR);
}

// * Capture

async function captureWithMap(map) {
  const screenshotBtn = document.getElementById("btn-screenshot");

  const toHide = [
    screenshotBtn,
    document.getElementById("controls-wrapper"),
    document.getElementById("namria-controls-container"),
    document.getElementById("tool-control"),
    document.querySelector(".basemap-switcher"),
    document.querySelector(".leaflet-control-container"),
  ].filter(Boolean);

  // Loading state
  screenshotBtn.style.display = "none";
  // screenshotBtn.classList.add("screenshot-btn--loading");
  // screenshotBtn.disabled = true;
  // lucide.createIcons();

  toHide.forEach((el) => (el.style.visibility = "hidden"));

  const svgEl = map._renderer?._container;
  if (svgEl) svgEl.style.visibility = "hidden";

  const restoreTiles = fixTilesForCapture(map);
  await new Promise((r) => requestAnimationFrame(r));

  const restore = () => {
    restoreTiles();
    if (svgEl) svgEl.style.visibility = "";
    toHide.forEach((el) => (el.style.visibility = ""));
  };

  try {
    const DPR = window.devicePixelRatio || 1;

    // Step 1 — tiles + UI (SVG hidden)
    const canvas = await html2canvas(document.body, {
      useCORS: true,
      allowTaint: true,
      scale: DPR,
      logging: false,
      scrollX: 0,
      scrollY: 0,
      width: window.innerWidth,
      windowWidth: window.innerWidth,
      height: window.innerHeight,
      windowHeight: window.innerHeight,
    });

    restore();

    // Step 2 — SVG overlay
    await drawSvgOverlayOntoCanvas(map, canvas, DPR);

    // Step 2b — details panel on top
    await drawDetailsPanelOntoCanvas(canvas, DPR);

    // Step 3 — stamps
    const ctx = canvas.getContext("2d");
    stampDisclaimer(ctx, canvas, DPR);
    stampDateTime(ctx, canvas, DPR);

    _capturedCanvas = canvas;
    document.getElementById("screenshot-preview-img").src =
      canvas.toDataURL("image/png");
    document
      .getElementById("screenshot-preview-modal")
      .classList.remove("hidden");
  } catch (err) {
    console.error("[Screenshot] Capture failed:", err);
    restore();
  } finally {
    screenshotBtn.style.display = "block";
    // screenshotBtn.innerHTML = '<i data-lucide="camera"></i>';
    // screenshotBtn.classList.remove("screenshot-btn--loading");
    // screenshotBtn.disabled = false;
    lucide.createIcons();
  }
}
