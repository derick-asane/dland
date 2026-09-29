import type { LngLat } from '@/components/map/LandMap';

const EARTH_RADIUS = 6_378_137; // metres (WGS84), same as Turf on the server
const rad = (d: number) => (d * Math.PI) / 180;

/** Geodesic area of an open ring in m² — a live preview; the server's measurement is authoritative. */
export function ringAreaSqm(ring: LngLat[]): number {
  if (ring.length < 3) return 0;
  let total = 0;
  for (let i = 0; i < ring.length; i++) {
    const [lng1, lat1] = ring[i];
    const [lng2, lat2] = ring[(i + 1) % ring.length];
    total += rad(lng2 - lng1) * (2 + Math.sin(rad(lat1)) + Math.sin(rad(lat2)));
  }
  return Math.abs((total * EARTH_RADIUS * EARTH_RADIUS) / 2);
}
