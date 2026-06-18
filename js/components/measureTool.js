export function initMeasureTool(map) {
  MeasureState.map = map;

  document.getElementById("btn-new-measure").addEventListener("click", () => {
    finalizeCurrentSession();
    startNewSession();
  });

  document
    .getElementById("btn-clear-all")
    .addEventListener("click", clearAllSessions);

  const toggleBtn = document.getElementById("measure-toggle");
  toggleBtn.addEventListener("click", () => toggleMeasureMode(toggleBtn));

  map.on("click", onMapClick);
  map.on("mousemove", onMapMouseMove);
  map.on("dblclick", onMapDoubleClick);
  document.addEventListener("keydown", onKeyDown);
}

// ── State ──

const MeasureState = {
  active: false,
  sessions: [],
  currentSession: null,
  map: null,
  isDraggingPoint: false,
  boundsOverlay: null,
};

const SESSION_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#84cc16",
];

const MEASURE_BOUNDS = L.latLngBounds(
  L.latLng(15.7, 119.5), // southwest corner
  L.latLng(18.9, 122.5), // northeast corner
);

function getSessionColor(index) {
  return SESSION_COLORS[index % SESSION_COLORS.length];
}

// ── Top-level event handlers ──

function toggleMeasureMode(toggleBtn) {
  const map = MeasureState.map;
  MeasureState.active = !MeasureState.active;
  toggleBtn.classList.toggle("active", MeasureState.active);
  document
    .getElementById("measure-panel")
    .classList.toggle("hidden", !MeasureState.active);
  document
    .getElementById("measure-tooltip")
    .classList.toggle("hidden", !MeasureState.active);

  if (MeasureState.active) {
    map.getContainer().style.cursor = "crosshair";
    if (!MeasureState.currentSession) startNewSession();
    showBoundsOverlay(map);
  } else {
    map.getContainer().style.cursor = "";
    finalizeCurrentSession();
    document.getElementById("measure-tooltip").classList.add("hidden");
    if (MeasureState.currentSession?.previewLine) {
      map.removeLayer(MeasureState.currentSession.previewLine);
      MeasureState.currentSession.previewLine = null;
    }
    hideBoundsOverlay(map);
  }
}

function onMapClick(e) {
  if (!MeasureState.active) return;
  if (MeasureState.isDraggingPoint) return;
  if (!MEASURE_BOUNDS.contains(e.latlng)) return;
  addMeasurePoint(e.latlng);
}

function onMapMouseMove(e) {
  if (!MeasureState.active || !MeasureState.currentSession) return;
  if (MeasureState.currentSession.points.length === 0) return;

  updatePreviewLine(e.latlng);

  const tooltip = document.getElementById("measure-tooltip");
  tooltip.style.left = e.originalEvent.clientX + "px";
  tooltip.style.top = e.originalEvent.clientY + "px";
}

function onMapDoubleClick(e) {
  if (!MeasureState.active) return;
  L.DomEvent.stopPropagation(e);
  finalizeCurrentSession();
  startNewSession();
  hideRulerTooltip();
}

function onKeyDown(e) {
  if (!MeasureState.active) return;
  if (e.key === "Escape" || e.key === "Enter") {
    finalizeCurrentSession();
    hideRulerTooltip();
  }
}

// ── Bounds overlay (inverted mask: red outside, clear inside) ──

function showBoundsOverlay(map) {
  if (MeasureState.boundsOverlay) return;

  const sw = MEASURE_BOUNDS.getSouthWest();
  const ne = MEASURE_BOUNDS.getNorthEast();

  // Outer ring (world, clockwise) fills with red; inner ring (the bounds,
  // counter-clockwise) is subtracted as a hole, leaving the allowed area clear.
  const maskGeoJSON = {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-180, -90],
          [-180, 90],
          [180, 90],
          [180, -90],
          [-180, -90],
        ],
        [
          [sw.lng, sw.lat],
          [sw.lng, ne.lat],
          [ne.lng, ne.lat],
          [ne.lng, sw.lat],
          [sw.lng, sw.lat],
        ],
      ],
    },
  };

  MeasureState.boundsOverlay = L.geoJSON(maskGeoJSON, {
    style: {
      color: "#ef4444",
      weight: 2,
      dashArray: "8 6",
      opacity: 0.85,
      fillColor: "#ef4444",
      fillOpacity: 0.18,
    },
    interactive: false,
  }).addTo(map);
}

function hideBoundsOverlay(map) {
  if (!MeasureState.boundsOverlay) return;
  map.removeLayer(MeasureState.boundsOverlay);
  MeasureState.boundsOverlay = null;
}

function clampToBounds(latlng) {
  const sw = MEASURE_BOUNDS.getSouthWest();
  const ne = MEASURE_BOUNDS.getNorthEast();
  return L.latLng(
    Math.max(sw.lat, Math.min(ne.lat, latlng.lat)),
    Math.max(sw.lng, Math.min(ne.lng, latlng.lng)),
  );
}

// ── Geometry helpers ──

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sin2 =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(sin2));
}

function totalSessionKm(session) {
  let total = 0;
  for (let i = 1; i < session.points.length; i++) {
    total += haversineKm(session.points[i - 1], session.points[i]);
  }
  return total;
}

// Midpoint along the great-circle arc between two points (not the flat
// lat/lng average), used to place the segment distance label.
function midpoint(a, b) {
  const lat1 = (a.lat * Math.PI) / 180;
  const lng1 = (a.lng * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const lng2 = (b.lng * Math.PI) / 180;

  const bx = Math.cos(lat2) * Math.cos(lng2 - lng1);
  const by = Math.cos(lat2) * Math.sin(lng2 - lng1);

  const midLat = Math.atan2(
    Math.sin(lat1) + Math.sin(lat2),
    Math.sqrt((Math.cos(lat1) + bx) ** 2 + by ** 2),
  );
  const midLng = lng1 + Math.atan2(by, Math.cos(lat1) + bx);

  return L.latLng((midLat * 180) / Math.PI, (midLng * 180) / Math.PI);
}

function formatKm(km) {
  if (km < 1) return (km * 1000).toFixed(0) + " m";
  return km.toFixed(3) + " km";
}

function formatLatLng(latlng) {
  return `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
}

// ── Session lifecycle ──

function startNewSession() {
  const color = getSessionColor(MeasureState.sessions.length);
  const session = {
    id: Date.now(),
    color,
    points: [],
    markers: [],
    polyline: null,
    previewLine: null,
    labels: [],
  };
  MeasureState.sessions.push(session);
  MeasureState.currentSession = session;
  renderMeasurePanel();
}

function finalizeCurrentSession() {
  const s = MeasureState.currentSession;
  if (!s) return;

  if (s.previewLine) {
    MeasureState.map.removeLayer(s.previewLine);
    s.previewLine = null;
  }

  if (s.points.length < 2) {
    removeMeasureSession(s.id);
    MeasureState.currentSession = null;
    return;
  }

  MeasureState.currentSession = null;
  renderMeasurePanel();
}

function removeMeasureSession(id) {
  const map = MeasureState.map;
  const idx = MeasureState.sessions.findIndex((s) => s.id === id);
  if (idx === -1) return;
  const s = MeasureState.sessions[idx];

  s.markers.forEach((m) => map.removeLayer(m));
  if (s.polyline) map.removeLayer(s.polyline);
  if (s.previewLine) map.removeLayer(s.previewLine);
  s.labels.forEach((l) => map.removeLayer(l));

  MeasureState.sessions.splice(idx, 1);
  if (MeasureState.currentSession?.id === id) {
    MeasureState.currentSession = null;
  }

  renderMeasurePanel();
}

function clearAllSessions() {
  [...MeasureState.sessions].forEach((s) => removeMeasureSession(s.id));
  MeasureState.currentSession = null;
  renderMeasurePanel();
}

// ── Point markers ──

function createPointMarker(map, latlng, color) {
  const marker = L.circleMarker(latlng, {
    radius: 5,
    color: "#fff",
    weight: 2,
    fillColor: color,
    fillOpacity: 1,
    zIndexOffset: 1000,
    bubblingMouseEvents: false,
  }).addTo(map);

  marker.bindTooltip(formatLatLng(latlng), {
    permanent: false,
    direction: "top",
    offset: [0, -8],
    className: "measure-latlng-tooltip",
  });

  return marker;
}

function addMeasurePoint(latlng) {
  const map = MeasureState.map;
  const s = MeasureState.currentSession;
  if (!s) {
    resumeSessionFromClick(latlng);
    return;
  }

  s.points.push(latlng);
  const marker = createPointMarker(map, latlng, s.color);
  const pointIndex = s.points.length - 1;

  marker.on("mousedown", (e) => startDraggingPoint(e, s, marker, pointIndex));
  marker.on("click", (e) =>
    resumeFromEndpoint(e, s, marker, pointIndex, latlng),
  );
  marker.on("contextmenu", (e) => deletePoint(e, s, marker, pointIndex));

  s.markers.push(marker);
  refreshPolyline(s);
  refreshLabels(s);
  renderMeasurePanel();
}

function startDraggingPoint(e, session, marker, pointIndex) {
  const map = MeasureState.map;
  L.DomEvent.stopPropagation(e);
  map.dragging.disable();
  MeasureState.isDraggingPoint = true;

  const onMove = (me) => {
    const raw = map.mouseEventToLatLng(me.originalEvent);
    const newLatLng = clampToBounds(raw);

    session.points[pointIndex] = newLatLng;
    marker.setLatLng(newLatLng);
    marker.setTooltipContent(formatLatLng(newLatLng));

    refreshPolyline(session);
    refreshLabels(session);
    renderMeasurePanel();
  };

  const onUp = () => {
    map.dragging.enable();
    map.off("mousemove", onMove);
    map.off("mouseup", onUp);
    setTimeout(() => {
      MeasureState.isDraggingPoint = false;
    }, 0);
  };

  map.on("mousemove", onMove);
  map.on("mouseup", onUp);
}

// Click an existing endpoint (when no session is active) to resume drawing from it
function resumeFromEndpoint(e, session, marker, pointIndex, latlng) {
  const map = MeasureState.map;
  L.DomEvent.stopPropagation(e);
  if (MeasureState.currentSession) return;

  MeasureState.currentSession = session;
  session.points.splice(pointIndex, 1);
  session.markers.splice(pointIndex, 1);
  map.removeLayer(marker);

  session.points.push(latlng);
  session.markers.push(createPointMarker(map, latlng, session.color));

  refreshPolyline(session);
  renderMeasurePanel();
}

function deletePoint(e, session, marker, pointIndex) {
  L.DomEvent.stopPropagation(e);
  session.points.splice(pointIndex, 1);
  MeasureState.map.removeLayer(marker);
  session.markers.splice(pointIndex, 1);
  refreshPolyline(session);
  refreshLabels(session);
  renderMeasurePanel();
}

// Resume drawing from an existing session's last point when no session is active
function resumeSessionFromClick(latlng) {
  const map = MeasureState.map;
  const SNAP_PX = 12;

  for (const session of MeasureState.sessions) {
    if (session.points.length === 0) continue;

    const lastPoint = session.points[session.points.length - 1];
    const screenPt = map.latLngToContainerPoint(lastPoint);
    const clickPt = map.latLngToContainerPoint(latlng);

    if (screenPt.distanceTo(clickPt) <= SNAP_PX) {
      MeasureState.currentSession = session;
      renderMeasurePanel();
      return;
    }
  }

  startNewSession();
  addMeasurePoint(latlng);
}

// ── Polyline and labels ──

function refreshPolyline(session) {
  const map = MeasureState.map;
  if (session.polyline) map.removeLayer(session.polyline);

  if (session.points.length < 2) {
    session.polyline = null;
    return;
  }

  session.polyline = L.polyline(session.points, {
    color: session.color,
    weight: 2.5,
    opacity: 0.9,
  }).addTo(map);
}

function refreshLabels(session) {
  const map = MeasureState.map;

  session.labels.forEach((l) => map.removeLayer(l));
  session.labels = [];

  for (let i = 1; i < session.points.length; i++) {
    const a = session.points[i - 1];
    const b = session.points[i];
    const dist = haversineKm(a, b);
    const mid = midpoint(a, b);

    const label = L.marker(mid, {
      icon: L.divIcon({
        className: "measure-label",
        html: formatKm(dist),
        iconAnchor: [0, 0],
      }),
      interactive: false,
      zIndexOffset: 500,
    }).addTo(map);

    session.labels.push(label);
  }
}

function updatePreviewLine(latlng) {
  const map = MeasureState.map;
  const s = MeasureState.currentSession;
  if (!s || s.points.length === 0) return;

  const last = s.points[s.points.length - 1];

  if (s.previewLine) {
    s.previewLine.setLatLngs([last, latlng]);
  } else {
    s.previewLine = L.polyline([last, latlng], {
      color: s.color,
      weight: 2,
      opacity: 0.5,
      dashArray: "6 5",
    }).addTo(map);
  }

  const total = totalSessionKm(s) + haversineKm(last, latlng);
  const tooltip = document.getElementById("measure-tooltip");
  tooltip.textContent = `+ ${formatKm(haversineKm(last, latlng))}  ·  Total: ${formatKm(total)}`;
}

// ── Panel ──

function renderMeasurePanel() {
  const panel = document.getElementById("measure-panel");
  if (!panel) return;

  const list = panel.querySelector(".measure-session-list");
  const totalSpan = panel.querySelector(".measure-panel-header span");

  const grandTotal = MeasureState.sessions.reduce(
    (sum, s) => sum + totalSessionKm(s),
    0,
  );
  totalSpan.textContent = formatKm(grandTotal);

  list.innerHTML = "";

  if (MeasureState.sessions.length === 0) {
    list.innerHTML =
      '<div style="padding:12px 14px;font-size:12px;color:var(--text-muted);">No measurements yet. Click the map to start.</div>';
    return;
  }

  MeasureState.sessions.forEach((s) => {
    const km = totalSessionKm(s);
    const isActive = MeasureState.currentSession?.id === s.id;

    const item = document.createElement("div");
    item.className = "measure-session-item";
    item.innerHTML = `
      <div class="measure-session-color" style="background:${s.color};${isActive ? `box-shadow:0 0 0 2px ${s.color}44;` : ""}"></div>
      <span class="measure-session-km">${formatKm(km)}</span>
      <span class="measure-session-pts">${s.points.length} pt${s.points.length !== 1 ? "s" : ""}${isActive ? " ·  drawing" : ""}</span>
      <button class="measure-session-remove" title="Remove this measurement" data-id="${s.id}">
        <i data-lucide="x" style="width:12px;height:12px;"></i>
      </button>
    `;

    item
      .querySelector(".measure-session-remove")
      .addEventListener("click", () => removeMeasureSession(s.id));

    list.appendChild(item);
  });

  lucide.createIcons();
}

function hideRulerTooltip() {
  const tooltip = document.getElementById("measure-tooltip");
  tooltip.classList.add("hidden");
  tooltip.textContent = "";
}
