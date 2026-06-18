export const BASEMAPS = {
  satellite: L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      attribution:
        '&copy; <a href="https://www.esri.com">Esri</a>, Maxar, Earthstar Geographics',
      maxZoom: 19,
    },
  ),
  street: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }),
  hybrid: L.layerGroup([
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        attribution: '&copy; <a href="https://www.esri.com">Esri</a>',
        maxZoom: 19,
      },
    ),
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        opacity: 0.85,
      },
    ),
  ]),
  topo: L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
    maxZoom: 17,
  }),
};

export const BasemapSwitcher = L.Control.extend({
  options: {
    position: "topright",
    currentBasemap: null,
    onChange: null,
  },

  onAdd(map) {
    const container = L.DomUtil.create("div", "basemap-switcher");
    L.DomEvent.disableClickPropagation(container);

    const layers = [
      { key: "satellite", label: "Satellite" },
      { key: "hybrid", label: "Hybrid" },
      { key: "street", label: "Street" },
      { key: "topo", label: "Topography" },
    ];

    layers.forEach(({ key, label }) => {
      const isActive = this.options.currentBasemap === BASEMAPS[key];
      const btn = L.DomUtil.create(
        "button",
        "bm-btn" + (isActive ? " active" : ""),
        container,
      );
      btn.innerHTML = `<span class="bm-label">${label}</span>`;
      btn.title = label + " basemap";

      L.DomEvent.on(btn, "click", () => {
        if (this.options.currentBasemap) {
          map.removeLayer(this.options.currentBasemap);
        }

        this.options.currentBasemap = BASEMAPS[key];
        this.options.currentBasemap.addTo(map);

        if (this.options.onChange) {
          this.options.onChange(this.options.currentBasemap);
        }

        container
          .querySelectorAll(".bm-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      });
    });

    return container;
  },
});
