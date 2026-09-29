/**
 * Self-contained Leaflet page rendered inside a WebView (iOS/Android) or an iframe (web).
 * The app drives it with `state` messages and receives `ready`, `bounds`, `select` and
 * `change` (drawn outline) messages back. Coordinates use GeoJSON order: [lng, lat].
 */
export interface MapLabels {
  streets: string;
  satellite: string;
  locate: string;
}

export function leafletHtml(labels: MapLabels) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body, #map { height: 100%; margin: 0; padding: 0; background: #e8ece9; }
  .price { background: #1B7F5A; color: #fff; font: 600 12px system-ui, sans-serif; padding: 3px 7px;
           border-radius: 999px; white-space: nowrap; box-shadow: 0 1px 4px rgba(0,0,0,.3); transform: translate(-50%, -50%); display: inline-block; }
  .price.selected { background: #E8A33D; }
  .vertex { width: 16px; height: 16px; margin: -8px 0 0 -8px; border-radius: 50%; background: #fff; border: 3px solid #E8A33D; box-sizing: border-box; }
  .vertex.first { border-color: #1B7F5A; }
  .locate { background: #fff; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 18px; }
  .leaflet-tooltip.ref { font: 600 11px system-ui, sans-serif; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
(function () {
  function send(msg) {
    var s = JSON.stringify(msg);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s);
    else window.parent.postMessage({ __dlandOut: s }, '*');
  }

  var map = L.map('map', { zoomControl: true }).setView([4, 12], 3);
  // Keyless Esri basemaps for development. For production, use a tile provider account (Esri, MapTiler, Mapbox…).
  var streets = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19, attribution: 'Map &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors'
  });
  var satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19, attribution: 'Imagery &copy; Esri'
  });
  var bases = {};
  bases[${JSON.stringify(labels.streets)}] = streets;
  bases[${JSON.stringify(labels.satellite)}] = satellite;
  L.control.layers(bases, null, { position: 'topright' }).addTo(map);
  streets.addTo(map);

  var Locate = L.Control.extend({
    options: { position: 'topleft' },
    onAdd: function () {
      var el = L.DomUtil.create('div', 'leaflet-bar locate');
      el.title = ${JSON.stringify(labels.locate)};
      el.innerHTML = '&#9678;';
      L.DomEvent.on(el, 'click', function (e) { L.DomEvent.stop(e); map.locate({ setView: true, maxZoom: 18 }); });
      return el;
    }
  });
  new Locate().addTo(map);

  var parcelsLayer = L.layerGroup().addTo(map);
  var drawLayer = L.layerGroup().addTo(map);
  var state = { mode: 'view', parcels: [], markers: [], drawing: [], selectedId: null, interactive: true };
  var lastFitKey = null, lastCenterKey = null, currentBase = 'streets';

  var toLatLng = function (p) { return [p[1], p[0]]; };

  function renderParcels() {
    parcelsLayer.clearLayers();
    (state.parcels || []).forEach(function (p) {
      var selected = p.id === state.selectedId;
      var poly = L.polygon(p.coords.map(toLatLng), {
        color: p.color || '#1B7F5A', weight: selected ? 4 : 2, fillOpacity: p.fillOpacity == null ? 0.25 : p.fillOpacity,
        dashArray: p.dashed ? '6 6' : null, interactive: state.mode !== 'draw'
      });
      if (p.label) poly.bindTooltip(p.label, { className: 'ref', sticky: true });
      poly.on('click', function () { send({ type: 'select', id: p.id }); });
      poly.addTo(parcelsLayer);
    });
    (state.markers || []).forEach(function (m) {
      var icon = L.divIcon({ className: '', html: '<div class="price' + (m.id === state.selectedId ? ' selected' : '') + '">' + m.label + '</div>', iconSize: [0, 0] });
      L.marker([m.lat, m.lng], { icon: icon, interactive: state.mode !== 'draw' })
        .on('click', function () { send({ type: 'select', id: m.id }); })
        .addTo(parcelsLayer);
    });
  }

  function renderDrawing() {
    drawLayer.clearLayers();
    var pts = state.drawing || [];
    if (state.mode !== 'draw') return;
    if (pts.length >= 2) {
      L.polygon(pts.map(toLatLng), { color: '#E8A33D', weight: 3, fillOpacity: 0.2, interactive: false }).addTo(drawLayer);
    }
    pts.forEach(function (p, i) {
      var icon = L.divIcon({ className: '', html: '<div class="vertex' + (i === 0 ? ' first' : '') + '"></div>', iconSize: [0, 0] });
      var marker = L.marker(toLatLng(p), { icon: icon, draggable: true }).addTo(drawLayer);
      marker.on('drag', function (e) {
        var ll = e.target.getLatLng();
        state.drawing[i] = [ll.lng, ll.lat];
        drawLayer.eachLayer(function (layer) { if (layer instanceof L.Polygon) layer.setLatLngs(state.drawing.map(toLatLng)); });
      });
      marker.on('dragend', function () { send({ type: 'change', coords: state.drawing }); });
    });
  }

  function fitToContent() {
    var b = L.latLngBounds([]);
    (state.parcels || []).forEach(function (p) { p.coords.forEach(function (c) { b.extend(toLatLng(c)); }); });
    (state.markers || []).forEach(function (m) { b.extend([m.lat, m.lng]); });
    (state.drawing || []).forEach(function (c) { b.extend(toLatLng(c)); });
    if (b.isValid()) map.fitBounds(b, { padding: [30, 30], maxZoom: 18 });
  }

  function geocode(queries) {
    if (!queries || !queries.length) return;
    var q = queries[0];
    fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q))
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res && res[0]) map.setView([+res[0].lat, +res[0].lon], queries.length > 1 ? 16 : 13);
        else geocode(queries.slice(1));
      })
      .catch(function () {});
  }

  function setInteractive(on) {
    ['dragging', 'touchZoom', 'doubleClickZoom', 'scrollWheelZoom', 'boxZoom', 'keyboard'].forEach(function (h) {
      if (map[h]) on ? map[h].enable() : map[h].disable();
    });
  }

  function handle(msg) {
    if (!msg || msg.type !== 'state') return;
    state = Object.assign(state, msg.state);
    state.drawing = (state.drawing || []).slice();
    setInteractive(state.interactive !== false);
    var base = state.baseLayer || 'streets';
    if (base !== currentBase) {
      map.removeLayer(base === 'satellite' ? streets : satellite);
      (base === 'satellite' ? satellite : streets).addTo(map);
      currentBase = base;
    }
    renderParcels();
    renderDrawing();
    if (state.fitKey && state.fitKey !== lastFitKey) { lastFitKey = state.fitKey; fitToContent(); }
    if (state.center && state.center.key !== lastCenterKey) {
      lastCenterKey = state.center.key;
      if (state.center.lat != null) map.setView([state.center.lat, state.center.lng], state.center.zoom || 16);
      else geocode(state.center.queries);
    }
  }

  map.on('click', function (e) {
    if (state.mode !== 'draw') return;
    state.drawing.push([+e.latlng.lng.toFixed(7), +e.latlng.lat.toFixed(7)]);
    renderDrawing();
    send({ type: 'change', coords: state.drawing });
  });

  map.on('moveend', function () {
    var b = map.getBounds();
    send({ type: 'bounds', minLat: b.getSouth(), maxLat: b.getNorth(), minLng: b.getWest(), maxLng: b.getEast(), zoom: map.getZoom() });
  });

  window.__dland = handle;
  function onMessage(e) {
    var d = e.data;
    try {
      if (d && d.__dlandIn) handle(JSON.parse(d.__dlandIn));
      else if (typeof d === 'string') handle(JSON.parse(d));
    } catch (err) {}
  }
  window.addEventListener('message', onMessage);
  document.addEventListener('message', onMessage);

  send({ type: 'ready' });
  var b0 = map.getBounds();
  send({ type: 'bounds', minLat: b0.getSouth(), maxLat: b0.getNorth(), minLng: b0.getWest(), maxLng: b0.getEast(), zoom: map.getZoom() });
})();
</script>
</body>
</html>`;
}
