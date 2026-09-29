import { area } from '@turf/area';
import { bbox } from '@turf/bbox';
import { centroid } from '@turf/centroid';
import { featureCollection, polygon } from '@turf/helpers';
import { intersect } from '@turf/intersect';
import { kinks } from '@turf/kinks';
import type { Land } from '@prisma/client';
import { canonicalJson } from '../blockchain/ledger';
import { prisma } from './prisma';
import { sha256 } from '../utils/crypto';
import { badRequest } from '../utils/errors';

/** GeoJSON order: [longitude, latitude]. */
export type Position = [number, number];

export interface BoundaryGeometry {
  type: 'Polygon';
  coordinates: Position[][];
}

const MIN_AREA_SQM = 10;
const MAX_AREA_SQM = 1_000_000_000; // 100,000 ha
// Intersections smaller than this are treated as drawing noise along a shared edge.
const OVERLAP_TOLERANCE_SQM = 1;

const round = (n: number) => Math.round(n * 1e7) / 1e7; // ~1 cm

/**
 * Validates a drawn outline and derives everything stored with it:
 * closed ring, measured area, centroid, bounding box and the fingerprint written to the chain.
 */
export function buildBoundary(points: Position[]) {
  const ring = points.map(([lng, lat]) => [round(lng), round(lat)] as Position);
  // Drop a closing point sent by the client; we close the ring ourselves.
  const [first, last] = [ring[0], ring[ring.length - 1]];
  if (ring.length > 3 && first[0] === last[0] && first[1] === last[1]) ring.pop();
  if (new Set(ring.map((p) => p.join(','))).size < 3) {
    throw badRequest('BOUNDARY_INVALID', 'A boundary needs at least 3 distinct points');
  }

  const geometry: BoundaryGeometry = { type: 'Polygon', coordinates: [[...ring, ring[0]]] };
  const feature = polygon(geometry.coordinates);
  if (kinks(feature).features.length > 0) {
    throw badRequest('BOUNDARY_SELF_INTERSECTS', 'The boundary lines cross each other');
  }
  const areaSqm = area(feature);
  if (areaSqm < MIN_AREA_SQM) throw badRequest('BOUNDARY_TOO_SMALL', 'The boundary is too small');
  if (areaSqm > MAX_AREA_SQM) throw badRequest('BOUNDARY_TOO_LARGE', 'The boundary is too large');

  const [minLng, minLat, maxLng, maxLat] = bbox(feature);
  const [lng, lat] = centroid(feature).geometry.coordinates;
  return {
    geometry,
    hash: boundaryHash(geometry),
    areaSqm: Math.round(areaSqm * 100) / 100,
    centroid: { latitude: round(lat), longitude: round(lng) },
    bbox: { minLat, maxLat, minLng, maxLng },
  };
}

export const boundaryHash = (geometry: BoundaryGeometry) => sha256(canonicalJson(geometry));

export interface Overlap {
  landId: string;
  reference: string;
  title: string;
  status: Land['status'];
  registeredOnChain: boolean;
  overlapSqm: number;
  /** Share of the checked parcel covered by the other one. */
  overlapPct: number;
}

/**
 * Finds parcels overlapping `geometry`. Only "claimed" parcels count: those registered on the
 * chain or waiting for a notary. Drafts are private and ignored. The bounding-box prefilter keeps
 * the precise polygon test to a handful of candidates.
 */
export async function findOverlaps(geometry: BoundaryGeometry, excludeLandId?: string): Promise<Overlap[]> {
  const feature = polygon(geometry.coordinates);
  const [minLng, minLat, maxLng, maxLat] = bbox(feature);
  const ownArea = area(feature);

  const candidates = await prisma.land.findMany({
    where: {
      id: excludeLandId ? { not: excludeLandId } : undefined,
      boundaryHash: { not: null },
      OR: [{ registeredOnChain: true }, { status: 'PENDING_VERIFICATION' }],
      minLat: { lte: maxLat },
      maxLat: { gte: minLat },
      minLng: { lte: maxLng },
      maxLng: { gte: minLng },
    },
    select: { id: true, reference: true, title: true, status: true, registeredOnChain: true, boundary: true },
  });

  const overlaps: Overlap[] = [];
  for (const c of candidates) {
    const other = c.boundary as unknown as BoundaryGeometry;
    const shared = intersect(featureCollection([feature, polygon(other.coordinates)]));
    const sharedArea = shared ? area(shared) : 0;
    if (sharedArea >= OVERLAP_TOLERANCE_SQM) {
      overlaps.push({
        landId: c.id,
        reference: c.reference,
        title: c.title,
        status: c.status,
        registeredOnChain: c.registeredOnChain,
        overlapSqm: Math.round(sharedArea * 100) / 100,
        overlapPct: Math.round((sharedArea / ownArea) * 1000) / 10,
      });
    }
  }
  return overlaps.sort((a, b) => b.overlapSqm - a.overlapSqm);
}

/** Declared vs. measured area; a large gap is a red flag for the notary. */
export function areaCheck(declaredSqm: number, measuredSqm: number | null) {
  if (!measuredSqm) return null;
  const diffPct = Math.round(((measuredSqm - declaredSqm) / declaredSqm) * 1000) / 10;
  return { declaredSqm, measuredSqm, diffPct, suspicious: Math.abs(diffPct) > 10 };
}
