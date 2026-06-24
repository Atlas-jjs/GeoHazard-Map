let map3D = null;
let isInitialized = false;

const CAR_BOUNDS = {
  center: [120.9, 17.25], // [lng, lat] for MapLibre
  minZoom: 7,
  maxZoom: 18,
  maxBounds: [
    [114.0, 12.7], // southwest [lng, lat]
    [128.0, 22.0], // northeast [lng, lat]
  ],
};

/* *
 * Initializes the MapLibre GL 3D Map
 * @param {L.Map} leafletMap
 */
export function init3DMap(leafletMap) {
  if (isInitialized) return;

  const center = leafletMap.getCenter();
  const zoom = leafletMap.getZoom();

  map3D = new maplibregl.Map({
    container: "map-3d",
    style: {
      version: 8,
      sources: {
        satellite: {
          type: "raster",
          tiles: [
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          ],
          tileSize: 256,
          attribution: "&copy; Esri, Maxar, Earthstar Geographics",
        },
        boundaries: {
          type: "raster",
          tiles: [
            "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
          ],
          tileSize: 256,
        },
      },
      layers: [
        {
          id: "satellite-layer",
          type: "raster",
          source: "satellite",
        },
        {
          id: "boundaries-layer",
          type: "raster",
          source: "boundaries",
          paint: {
            "raster-opacity": 0.85,
          },
        },
      ],
    },
    center: CAR_BOUNDS.center,
    zoom: zoom - 1.2,
    pitch: 58,
    bearing: -15,
    maxPitch: 85,
    minZoom: CAR_BOUNDS.minZoom,
    maxZoom: CAR_BOUNDS.maxZoom,
    maxBounds: CAR_BOUNDS.maxBounds,
  });

  // Add standard navigation controls (compass, pitch control)
  map3D.addControl(new maplibregl.NavigationControl(), "top-left");

  map3D.on("load", () => {
    map3D.addSource("terrain-source", {
      type: "raster-dem",
      tiles: [
        "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      encoding: "terrarium",
    });
    map3D.setTerrain({ source: "terrain-source", exaggeration: 1.3 });
  });

  isInitialized = true;
}

export function show3DMap(leafletMap) {
  if (!isInitialized) {
    init3DMap(leafletMap);
  } else {
    const center = leafletMap.getCenter();
    const zoom = leafletMap.getZoom();

    const clampedLng = Math.min(Math.max(center.lng, 114.0), 128.0);
    const clampedLat = Math.min(Math.max(center.lat, 12.7), 22.0);

    map3D.jumpTo({
      center: [clampedLng, clampedLat],
      zoom: zoom - 1.2,
      pitch: 58,
      bearing: -15,
    });
  }

  document.body.classList.add("mode-3d");

  // Trigger MapLibre resize to fit the layout correctly
  setTimeout(() => {
    if (map3D) {
      map3D.resize();
    }
  }, 100);
}

/* *
 * Hides the 3D map container and syncs view back to Leaflet
 * @param {L.Map} leafletMap
 */
export function hide3DMap(leafletMap) {
  if (isInitialized && map3D) {
    const center = map3D.getCenter();
    const zoom = map3D.getZoom();
    leafletMap.setView([center.lat, center.lng], Math.round(zoom + 1.2));
  }

  document.body.classList.remove("mode-3d");

  // Trigger Leaflet resize after transition completes
  setTimeout(() => {
    leafletMap.invalidateSize();
  }, 850);
}
