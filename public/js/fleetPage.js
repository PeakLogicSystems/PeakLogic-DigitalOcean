(function () {
  const stations = window.FLEET_STATIONS || [];
  const coverageRadiusM = window.FLEET_COVERAGE_RADIUS_M || 38000;
  const el = document.getElementById('fleet-map');
  if (!el || typeof L === 'undefined') return;

  const map = L.map(el, { scrollWheelZoom: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap',
  }).addTo(map);

  const colorFor = (s) => {
    if (s.alarmState === 'alarm') return '#e53935';
    if (s.alarmState === 'offline') return '#757575';
    if (s.alarmState === 'warning') return '#f9a825';
    return s.mapColor || '#00897b';
  };

  const cluster = L.markerClusterGroup({ maxClusterRadius: 50 });
  const coverageLayer = L.layerGroup();
  map.addLayer(coverageLayer);

  const countyBoxes = Array.from(document.querySelectorAll('.fleet-county-cb'));
  const countEl = document.getElementById('fleet-coverage-count');
  const stationMarkers = [];

  function selectedSlugs() {
    return new Set(countyBoxes.filter((b) => b.checked).map((b) => b.value));
  }

  function refreshCoverageCircles() {
    coverageLayer.clearLayers();
    const slugs = selectedSlugs();
    countyBoxes.forEach((box) => {
      if (!box.checked) return;
      const lat = Number(box.dataset.lat);
      const lng = Number(box.dataset.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      L.circle([lat, lng], {
        radius: coverageRadiusM,
        color: '#6f42c1',
        weight: 1,
        fillColor: '#6f42c1',
        fillOpacity: 0.08,
      }).addTo(coverageLayer);
    });
    return slugs;
  }

  function refreshMarkers() {
    const slugs = refreshCoverageCircles();
    cluster.clearLayers();
    stationMarkers.length = 0;
    const bounds = [];

    stations.forEach((s) => {
      if (s.lat == null || s.lng == null) return;
      const county = String(s.county || '').toLowerCase();
      if (slugs.size && county && !slugs.has(county)) return;
      const lat = Number(s.lat);
      const lng = Number(s.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      bounds.push([lat, lng]);
      const marker = L.circleMarker([lat, lng], {
        radius: 8,
        color: '#fff',
        weight: 1,
        fillColor: colorFor(s),
        fillOpacity: 0.9,
      });
      marker.bindPopup(
        `<strong>${s.name}</strong><br>${s.stationTypeLabel || s.stationType}<br>`
        + `<span style="color:${colorFor(s)}">${s.alarmState}</span><br>`
        + `<a href="/fleet/stations/${s.systemId}">Details</a>`,
      );
      cluster.addLayer(marker);
      stationMarkers.push(marker);
    });

    if (!map.hasLayer(cluster)) map.addLayer(cluster);

    if (bounds.length) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 10 });
    } else if (slugs.size) {
      const circleBounds = [];
      countyBoxes.forEach((box) => {
        if (!box.checked) return;
        const lat = Number(box.dataset.lat);
        const lng = Number(box.dataset.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) circleBounds.push([lat, lng]);
      });
      if (circleBounds.length) map.fitBounds(circleBounds, { padding: [40, 40], maxZoom: 8 });
    } else {
      map.setView([27.5, -81.5], 7);
    }

    if (countEl) {
      const visible = stationMarkers.length;
      countEl.textContent = `${slugs.size} counties · ${visible} stations`;
    }
  }

  countyBoxes.forEach((b) => b.addEventListener('change', refreshMarkers));
  document.getElementById('fleet-coverage-all')?.addEventListener('click', () => {
    countyBoxes.forEach((b) => { b.checked = true; });
    refreshMarkers();
  });
  document.getElementById('fleet-coverage-none')?.addEventListener('click', () => {
    countyBoxes.forEach((b) => { b.checked = false; });
    refreshMarkers();
  });

  refreshMarkers();
})();
