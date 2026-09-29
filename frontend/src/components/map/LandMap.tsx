import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useTranslation } from 'react-i18next';
import { colors } from '@/theme';
import { leafletHtml } from './leafletHtml';

/** GeoJSON order: [longitude, latitude]. */
export type LngLat = [number, number];

export interface MapParcel {
  id: string;
  coords: LngLat[];
  label?: string;
  color?: string;
  fillOpacity?: number;
  dashed?: boolean;
}

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
}

export interface MapBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  zoom: number;
}

export interface MapCenter {
  /** Changing the key re-centres the map. */
  key: string;
  lat?: number;
  lng?: number;
  zoom?: number;
  /** Addresses to geocode, most precise first, when no coordinates are known. */
  queries?: string[];
}

interface Props {
  mode?: 'view' | 'draw';
  parcels?: MapParcel[];
  markers?: MapMarker[];
  drawing?: LngLat[];
  selectedId?: string | null;
  /** Changing this key fits the map to its content. */
  fitKey?: string;
  center?: MapCenter;
  baseLayer?: 'streets' | 'satellite';
  interactive?: boolean;
  style?: StyleProp<ViewStyle>;
  onChange?: (coords: LngLat[]) => void;
  onSelect?: (id: string) => void;
  onBounds?: (bounds: MapBounds) => void;
}

/** Leaflet renders labels as HTML, and titles are user content: escape them. */
const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

type OutMessage =
  | { type: 'ready' }
  | { type: 'change'; coords: LngLat[] }
  | { type: 'select'; id: string }
  | ({ type: 'bounds' } & MapBounds);

/**
 * Cross-platform Leaflet map: a WebView on iOS/Android, an iframe on web.
 * Supports viewing parcels/pins and drawing a parcel outline.
 */
export function LandMap({
  mode = 'view',
  parcels = [],
  markers = [],
  drawing = [],
  selectedId = null,
  fitKey,
  center,
  baseLayer = 'streets',
  interactive = true,
  style,
  onChange,
  onSelect,
  onBounds,
}: Props) {
  const { t } = useTranslation();
  const html = useMemo(
    () => leafletHtml({ streets: t('map.streets'), satellite: t('map.satellite'), locate: t('map.locate') }),
    [t],
  );
  const webRef = useRef<WebView>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);

  // Keep the latest callbacks without re-binding listeners.
  const handlers = useRef({ onChange, onSelect, onBounds });
  useEffect(() => {
    handlers.current = { onChange, onSelect, onBounds };
  });

  const receive = useCallback((raw: string) => {
    let msg: OutMessage;
    try {
      msg = JSON.parse(raw) as OutMessage;
    } catch {
      return;
    }
    if (msg.type === 'ready') setReady(true);
    else if (msg.type === 'change') handlers.current.onChange?.(msg.coords);
    else if (msg.type === 'select') handlers.current.onSelect?.(msg.id);
    else if (msg.type === 'bounds') {
      const { type: _type, ...bounds } = msg;
      handlers.current.onBounds?.(bounds);
    }
  }, []);

  // Web: messages from the iframe arrive on window.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const listener = (e: MessageEvent) => {
      if (e.source === frameRef.current?.contentWindow && e.data?.__dlandOut) receive(e.data.__dlandOut);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [receive]);

  const state = useMemo(
    () => ({
      mode,
      parcels: parcels.map((p) => ({ ...p, label: p.label && escapeHtml(p.label) })),
      markers: markers.map((m) => ({ ...m, label: escapeHtml(m.label) })),
      drawing,
      selectedId,
      fitKey,
      center,
      baseLayer,
      interactive,
    }),
    [mode, parcels, markers, drawing, selectedId, fitKey, center, baseLayer, interactive],
  );

  useEffect(() => {
    if (!ready) return;
    const payload = JSON.stringify({ type: 'state', state });
    if (Platform.OS === 'web') {
      frameRef.current?.contentWindow?.postMessage({ __dlandIn: payload }, '*');
    } else {
      webRef.current?.injectJavaScript(`window.__dland && window.__dland(${payload}); true;`);
    }
  }, [ready, state]);

  return (
    <View style={[styles.container, style]}>
      {Platform.OS === 'web' ? (
        <iframe ref={frameRef} srcDoc={html} style={{ border: 0, width: '100%', height: '100%' }} allow="geolocation" title="map" />
      ) : (
        <WebView
          ref={webRef}
          originWhitelist={['*']}
          source={{ html }}
          onMessage={(e: WebViewMessageEvent) => receive(e.nativeEvent.data)}
          geolocationEnabled
          javaScriptEnabled
          style={{ flex: 1 }}
        />
      )}
    </View>
  );
}

/** Converts a stored GeoJSON Polygon to an open ring of [lng, lat] points. */
export function ringFromBoundary(boundary: { coordinates: LngLat[][] } | null | undefined): LngLat[] {
  const ring = boundary?.coordinates?.[0] ?? [];
  return ring.length > 1 ? ring.slice(0, -1) : ring;
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden', backgroundColor: colors.border },
});
