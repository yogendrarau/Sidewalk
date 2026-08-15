import React, { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Street-level map of the restricted-streets snapshot.
 *
 * Basemap: OpenStreetMap raster tiles when the network allows, drawn OVER an
 * always-bundled borough-outline vector floor — so with tiles blocked (the
 * e2e suite aborts all external requests) the map still renders a
 * recognizable NYC with every restricted segment, instead of a grey void.
 *
 * Leaflet is used imperatively and defensively:
 * - zoomControl/attributionControl are disabled — their stylesheet uses
 *   physical margins that break under RTL; controls are ordinary buttons
 *   outside the canvas and attribution is plain text below it.
 * - No L.marker / default icon assets (they 404 under bundlers); pins are
 *   vector circleMarkers.
 * - No popups; selection writes to the external report panel.
 * - The canvas subtree is pinned dir="ltr"; a north-up map is not a
 *   bidirectional object.
 */

const CITY_BOUNDS = L.latLngBounds([40.48, -74.28], [40.94, -73.68]);

const STATUS_COLOR = {
  restricted_now: "#c0271c",
  restricted_later_today: "#c98a12",
  not_restricted_today: "#0d7a5f",
  out_of_season: "#7ba895",
  unknown: "#7b847f",
};

/**
 * @param {{
 *   data: any,
 *   statusOf: (row: any) => any,
 *   selectedId: string | null,
 *   onSelectRow: (rowId: string) => void,
 *   onQueryPoint: (point: {lat: number, lng: number}) => void,
 *   vendors?: Array<{id: string, name: string, emoji: string, lat: number, lng: number}> | null,
 *   selectedVendorId?: string | null,
 *   onSelectVendor?: ((vendor: any) => void) | null,
 *   labels: {mapLabel: string, accessNote: string, cityView: string},
 * }} props
 */
export default function StreetRulesMap({
  data,
  statusOf,
  selectedId,
  onSelectRow,
  onQueryPoint,
  vendors = null,
  selectedVendorId = null,
  onSelectVendor = null,
  labels,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef(new Map());
  const vendorLayersRef = useRef(new Map());
  const callbacksRef = useRef({ onSelectRow, onQueryPoint, onSelectVendor });
  callbacksRef.current = { onSelectRow, onQueryPoint, onSelectVendor };

  const boroughBounds = useMemo(() => {
    /** @type {Array<{key: string, label: string, bounds: L.LatLngBounds}>} */
    const presets = [{ key: "city", label: labels.cityView, bounds: CITY_BOUNDS }];
    const byBorough = new Map();
    for (const feature of data.geometry.features) {
      const code = feature.properties.borough_code;
      const bounds = byBorough.get(code) ?? L.latLngBounds([]);
      const geom = feature.geometry;
      if (geom.type === "Point") bounds.extend([geom.coordinates[1], geom.coordinates[0]]);
      else for (const path of geom.coordinates) for (const [lng, lat] of path) bounds.extend([lat, lng]);
      byBorough.set(code, bounds);
    }
    for (const outline of data.outlines.features) {
      const code = outline.properties.borough_code;
      const bounds = byBorough.get(code);
      if (!bounds || !bounds.isValid()) continue;
      presets.push({ key: "b" + code, label: outline.properties.borough, bounds: bounds.pad(0.25) });
    }
    return presets;
  }, [data, labels.cityView]);

  useEffect(() => {
    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: false,
      minZoom: 10,
      maxZoom: 18,
      maxBounds: CITY_BOUNDS.pad(0.3),
      maxBoundsViscosity: 1.0,
    });
    mapRef.current = map;
    map.fitBounds(CITY_BOUNDS);

    // Always-available vector floor, under the tile pane (tilePane z=200).
    map.createPane("floor").style.zIndex = "150";
    L.geoJSON(data.outlines, {
      pane: "floor",
      style: { color: "#c3d2c6", weight: 1.5, fillColor: "#e2ebe3", fillOpacity: 1 },
      interactive: false,
    }).addTo(map);

    // Real streets when the network allows; the floor shows through when not.
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      className: "rules-tiles",
    }).addTo(map);

    const layers = layersRef.current;
    for (const feature of data.geometry.features) {
      const rowId = feature.properties.row_id;
      const isPoint = feature.geometry.type === "Point";
      const layer = isPoint
        ? L.circleMarker(
          [feature.geometry.coordinates[1], feature.geometry.coordinates[0]],
          { radius: 6, weight: 2, fillOpacity: 0.9 },
        )
        : L.geoJSON(feature, {
          style: { weight: 5, opacity: 0.9 },
        });
      layer.on("click", (event) => {
        L.DomEvent.stopPropagation(event);
        callbacksRef.current.onSelectRow(rowId);
      });
      layer.addTo(map);
      layers.set(rowId, { layer, isPoint, tier: feature.properties.tier });
    }

    map.on("click", (event) => {
      callbacksRef.current.onQueryPoint({ lat: event.latlng.lat, lng: event.latlng.lng });
    });

    // Clearly-labeled FICTIONAL sample vendors: emoji divIcon pins (vector
    // HTML, no image assets), never real businesses, never orderable.
    const vendorLayers = vendorLayersRef.current;
    for (const vendor of vendors ?? []) {
      const marker = L.marker([vendor.lat, vendor.lng], {
        icon: L.divIcon({
          className: "rules-vendor-icon",
          html: `<span class="rules-vendor-pin" data-sample-vendor="${vendor.id}">${vendor.emoji}</span>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
        keyboard: false,
      });
      marker.on("click", (event) => {
        L.DomEvent.stopPropagation(event);
        callbacksRef.current.onSelectVendor?.(vendor);
      });
      marker.addTo(map);
      vendorLayers.set(vendor.id, marker);
    }

    const raf = requestAnimationFrame(() => map.invalidateSize());
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(containerRef.current);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      layers.clear();
      vendorLayers.clear();
      map.remove();
      mapRef.current = null;
    };
    // The dataset and vendor seed are immutable for the life of the surface.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, vendors]);

  useEffect(() => {
    for (const [vendorId, marker] of vendorLayersRef.current) {
      const element = marker.getElement();
      if (element) {
        element.classList.toggle("selected", vendorId === selectedVendorId);
      }
    }
  }, [selectedVendorId, vendors]);

  // Restyle on status changes (minute ticks) and selection changes.
  useEffect(() => {
    const rowsById = new Map(data.rows.map((row) => [row.id, row]));
    for (const [rowId, entry] of layersRef.current) {
      const row = rowsById.get(rowId);
      const status = statusOf(row);
      const selected = rowId === selectedId;
      const color = selected ? "#17241e" : STATUS_COLOR[status?.status] ?? STATUS_COLOR.unknown;
      if (entry.isPoint) {
        entry.layer.setStyle({ color, fillColor: color, radius: selected ? 8 : 6 });
      } else {
        entry.layer.setStyle({
          color,
          weight: selected ? 8 : 5,
          dashArray: entry.tier === "corridor" ? "6 5" : null,
        });
      }
      if (selected && entry.layer.bringToFront) entry.layer.bringToFront();
    }
  }, [data, statusOf, selectedId]);

  function flyTo(bounds) {
    mapRef.current?.fitBounds(bounds);
  }

  return (
    <div className="rules-map-shell" dir="ltr">
      <div className="rules-map-controls" role="group" aria-label={labels.mapLabel}>
        {boroughBounds.map((preset) => (
          <button
            key={preset.key}
            type="button"
            data-testid={"rules-map-view-" + preset.key}
            onClick={() => flyTo(preset.bounds)}
          >
            {preset.label}
          </button>
        ))}
        <button type="button" aria-label="+" className="rules-map-zoom" onClick={() => mapRef.current?.zoomIn()}>+</button>
        <button type="button" aria-label="−" className="rules-map-zoom" onClick={() => mapRef.current?.zoomOut()}>−</button>
      </div>
      <p className="marketplace-sr-only">{labels.accessNote}</p>
      <div
        ref={containerRef}
        data-testid="rules-map-canvas"
        className="rules-map-canvas"
        role="img"
        aria-label={labels.mapLabel}
      />
      <p className="rules-map-attribution">
        <bdi dir="ltr">Basemap © OpenStreetMap contributors · Data: NYC DOHMH / NYC Open Data</bdi>
      </p>
    </div>
  );
}
