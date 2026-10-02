import { Router } from 'express';
import path from 'node:path';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { listingFeeState } from '../lib/payments/service';
import { audit } from '../lib/audit';
import { areaCheck, buildBoundary, findOverlaps, type BoundaryGeometry } from '../lib/geo';
import { notify, notifyRole } from '../lib/notify';
import { authenticate, currentUser, optionalAuth, requireRole } from '../middleware/auth';
import { discardIncoming, imageUpload, privateUpload, publicPath, removeUpload, storePrivate } from '../middleware/upload';
import { privateStorage } from '../lib/storage';
import { param, parseQuery, validateBody } from '../middleware/validate';
import { AppError, badRequest, conflict, forbidden, notFound } from '../utils/errors';
import { pageResult, paginate, paginationSchema } from '../utils/pagination';
import {
  canDownloadDocuments,
  canViewLand,
  EDITABLE_STATUSES,
  assertNotBlocked,
  assertNotFrozen,
  isStaff,
  landCardInclude,
  landDetailInclude,
  newLandReference,
} from './lands.shared';

const router = Router();

const MAX_IMAGES = 12;
const landTypes = ['RESIDENTIAL', 'COMMERCIAL', 'AGRICULTURAL', 'INDUSTRIAL', 'MIXED'] as const;

// ---------------------------------------------------------------------------
// Search (public)
// ---------------------------------------------------------------------------

const searchSchema = paginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  city: z.string().trim().max(80).optional(),
  country: z.string().trim().max(80).optional(),
  landType: z.enum(landTypes).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  minArea: z.coerce.number().min(0).optional(),
  maxArea: z.coerce.number().min(0).optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'area_desc', 'popular']).default('newest'),
});

const sortMap: Record<z.infer<typeof searchSchema>['sort'], Prisma.LandOrderByWithRelationInput> = {
  newest: { publishedAt: 'desc' },
  price_asc: { price: 'asc' },
  price_desc: { price: 'desc' },
  area_desc: { areaSqm: 'desc' },
  popular: { viewsCount: 'desc' },
};

router.get('/', optionalAuth, async (req, res) => {
  const f = parseQuery(searchSchema, req);
  const where: Prisma.LandWhereInput = {
    status: { in: ['PUBLISHED', 'UNDER_OFFER'] },
    landType: f.landType,
    city: f.city ? { contains: f.city, mode: 'insensitive' } : undefined,
    country: f.country ? { contains: f.country, mode: 'insensitive' } : undefined,
    price: f.minPrice !== undefined || f.maxPrice !== undefined ? { gte: f.minPrice, lte: f.maxPrice } : undefined,
    areaSqm: f.minArea !== undefined || f.maxArea !== undefined ? { gte: f.minArea, lte: f.maxArea } : undefined,
    OR: f.q
      ? [
          { title: { contains: f.q, mode: 'insensitive' } },
          { description: { contains: f.q, mode: 'insensitive' } },
          { city: { contains: f.q, mode: 'insensitive' } },
          { address: { contains: f.q, mode: 'insensitive' } },
          { reference: { equals: f.q.toUpperCase() } },
        ]
      : undefined,
  };
  const [items, total] = await Promise.all([
    prisma.land.findMany({ where, include: landCardInclude, orderBy: sortMap[f.sort], ...paginate(f.page, f.pageSize) }),
    prisma.land.count({ where }),
  ]);
  const favoriteIds = req.user
    ? new Set(
        (
          await prisma.favorite.findMany({
            where: { userId: req.user.id, landId: { in: items.map((l) => l.id) } },
            select: { landId: true },
          })
        ).map((f) => f.landId),
      )
    : new Set<string>();
  res.json(pageResult(items.map((l) => ({ ...l, isFavorite: favoriteIds.has(l.id) })), total, f.page, f.pageSize));
});

// ---------------------------------------------------------------------------
// Owner views
// ---------------------------------------------------------------------------

router.get('/mine', authenticate, async (req, res) => {
  const lands = await prisma.land.findMany({
    where: { ownerId: currentUser(req).id },
    include: { ...landCardInclude, _count: { select: { favorites: true, offers: { where: { status: 'PENDING' } } } } },
    orderBy: { updatedAt: 'desc' },
  });
  res.json({ items: lands });
});

router.get('/favorites', authenticate, async (req, res) => {
  const favorites = await prisma.favorite.findMany({
    where: { userId: currentUser(req).id },
    include: { land: { include: landCardInclude } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ items: favorites.map((f) => ({ ...f.land, isFavorite: true })) });
});

// ---------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------

const mapQuery = z
  .object({
    minLat: z.coerce.number().min(-90).max(90),
    maxLat: z.coerce.number().min(-90).max(90),
    minLng: z.coerce.number().min(-180).max(180),
    maxLng: z.coerce.number().min(-180).max(180),
    // market: listings for sale · registry: every parcel registered on the chain (for drawing)
    layer: z.enum(['market', 'registry']).default('market'),
  })
  .refine((q) => q.minLat <= q.maxLat && q.minLng <= q.maxLng, { message: 'Invalid bounds' });

/** Lands visible in a map viewport: parcels whose boundary box, or whose pin, falls in view. */
router.get('/map', async (req, res) => {
  const q = parseQuery(mapQuery, req);
  const inView: Prisma.LandWhereInput = {
    OR: [
      { minLat: { lte: q.maxLat }, maxLat: { gte: q.minLat }, minLng: { lte: q.maxLng }, maxLng: { gte: q.minLng } },
      { boundaryHash: null, latitude: { gte: q.minLat, lte: q.maxLat }, longitude: { gte: q.minLng, lte: q.maxLng } },
    ],
  };
  const where: Prisma.LandWhereInput =
    q.layer === 'registry'
      ? { AND: [inView, { registeredOnChain: true, boundaryHash: { not: null } }] }
      : { AND: [inView, { status: { in: ['PUBLISHED', 'UNDER_OFFER'] } }] };
  const lands = await prisma.land.findMany({
    where,
    take: 300,
    orderBy: { publishedAt: 'desc' },
    select: {
      id: true,
      reference: true,
      title: true,
      status: true,
      landType: true,
      city: true,
      areaSqm: true,
      latitude: true,
      longitude: true,
      boundary: true,
      ...(q.layer === 'market' ? { price: true, currency: true, images: { orderBy: { position: 'asc' }, take: 1 } } : {}),
    },
  });
  res.json({ items: lands });
});

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

router.get('/:id', optionalAuth, async (req, res) => {
  const id = param(req, 'id');
  const land = await prisma.land.findFirst({
    where: { OR: [{ id }, { reference: id.toUpperCase() }] },
    include: landDetailInclude,
  });
  if (!land || !canViewLand(land, req.user)) throw notFound('LAND_NOT_FOUND', 'Land not found');

  const isOwner = land.ownerId === req.user?.id;
  if (!isOwner) {
    await prisma.land.update({ where: { id: land.id }, data: { viewsCount: { increment: 1 } } });
  }
  const openDisputes = await prisma.dispute.count({ where: { landId: land.id, status: { in: ['OPEN', 'UNDER_REVIEW'] } } });
  const [favorite, myOffer, myVisit, pendingVisits] = req.user
    ? await Promise.all([
        prisma.favorite.findUnique({ where: { userId_landId: { userId: req.user.id, landId: land.id } } }),
        prisma.offer.findFirst({
          where: { landId: land.id, buyerId: req.user.id, status: { in: ['PENDING', 'ACCEPTED'] } },
          orderBy: { createdAt: 'desc' },
        }),
        isOwner
          ? null
          : prisma.visit.findFirst({
              where: { landId: land.id, visitorId: req.user.id, status: { in: ['REQUESTED', 'CONFIRMED'] } },
              orderBy: { createdAt: 'desc' },
            }),
        isOwner ? prisma.visit.count({ where: { landId: land.id, status: 'REQUESTED' } }) : 0,
      ])
    : [null, null, null, 0];

  // Everyone sees which documents exist and their fingerprints; only the owner and staff can open them.
  const canOpen = canDownloadDocuments(land, req.user);
  res.json({
    land: {
      ...land,
      documents: land.documents.map((d) => ({ ...d, canOpen })),
      openDisputes,
      isFavorite: Boolean(favorite),
      isOwner,
      myOffer,
      myVisit,
      pendingVisits,
      // Owner only: whether the listing fee for this listing is paid.
      listingFee: isOwner ? await listingFeeState(land.id, land.ownerId) : undefined,
    },
  });
});

// ---------------------------------------------------------------------------
// Create / update (sellers)
// ---------------------------------------------------------------------------

const landBody = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(5000),
  price: z.coerce.number().positive(),
  currency: z.string().trim().length(3).toUpperCase().default('USD'),
  areaSqm: z.coerce.number().positive(),
  landType: z.enum(landTypes),
  address: z.string().trim().min(3).max(200),
  city: z.string().trim().min(1).max(80),
  region: z.string().trim().max(80).nullable().optional(),
  country: z.string().trim().min(2).max(80),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  parcelNumber: z.string().trim().min(1).max(60),
  titleDeedNumber: z.string().trim().min(1).max(60),
});

router.post('/', authenticate, requireRole('CLIENT', 'ADMIN'), validateBody(landBody), async (req, res) => {
  const body = req.body as z.infer<typeof landBody>;
  const duplicate = await prisma.land.findUnique({
    where: { parcelNumber_country: { parcelNumber: body.parcelNumber, country: body.country } },
  });
  if (duplicate) throw conflict('PARCEL_ALREADY_LISTED', 'This parcel is already registered on DLand');

  const land = await prisma.land.create({
    data: { ...body, reference: newLandReference(), ownerId: currentUser(req).id },
    include: landDetailInclude,
  });
  await audit({ action: 'LAND_CREATED', entityType: 'Land', entityId: land.id, req });
  res.status(201).json({ land });
});

/** Loads a land the current user owns, or throws. */
async function ownedLand(landId: string, userId: string) {
  const land = await prisma.land.findUnique({ where: { id: landId } });
  if (!land) throw notFound('LAND_NOT_FOUND', 'Land not found');
  if (land.ownerId !== userId) throw forbidden('NOT_LAND_OWNER', 'You do not own this land');
  // Every owner action (edit, photos, documents, boundary, submit, archive, delete) is locked while blocked.
  assertNotBlocked(land);
  return land;
}

function assertEditable(status: string) {
  if (!EDITABLE_STATUSES.includes(status as never)) {
    throw badRequest('LAND_NOT_EDITABLE', 'This listing cannot be edited in its current status');
  }
}

/** Commercial fields a seller may change on a live listing without a new notary review. */
const LIVE_EDITABLE_FIELDS = ['title', 'description', 'price', 'currency'];

router.patch('/:id', authenticate, validateBody(landBody.partial()), async (req, res) => {
  const land = await ownedLand(param(req, 'id'), currentUser(req).id);
  const body = req.body as Partial<z.infer<typeof landBody>>;
  if (land.status === 'PUBLISHED') {
    const blocked = Object.keys(body).filter((k) => !LIVE_EDITABLE_FIELDS.includes(k));
    if (blocked.length > 0) {
      throw badRequest('FIELD_REQUIRES_REVIEW', 'Archive the listing to change location or registry details', { fields: blocked });
    }
  } else {
    assertEditable(land.status);
  }

  // Once on the chain, the cadastral identity of a parcel is immutable.
  if (land.registeredOnChain) {
    const locked = ['parcelNumber', 'titleDeedNumber', 'country', 'areaSqm'] as const;
    for (const key of locked) {
      if (body[key] !== undefined && String(body[key]) !== String(land[key])) {
        throw badRequest('FIELD_LOCKED_ON_CHAIN', `${key} is locked once the land is registered on the blockchain`);
      }
    }
  }
  // With a drawn boundary, the map position is its centroid and cannot be typed in.
  if (land.boundaryHash) {
    delete body.latitude;
    delete body.longitude;
  }
  const updated = await prisma.land.update({ where: { id: land.id }, data: body, include: landDetailInclude });
  res.json({ land: updated });
});

router.delete('/:id', authenticate, async (req, res) => {
  const land = await ownedLand(param(req, 'id'), currentUser(req).id);
  if (land.status !== 'DRAFT' || land.registeredOnChain) {
    throw badRequest('LAND_NOT_DELETABLE', 'Only drafts that were never registered can be deleted; archive it instead');
  }
  const files = await prisma.land.findUniqueOrThrow({
    where: { id: land.id },
    select: { images: { select: { url: true } }, documents: { select: { storageKey: true } } },
  });
  await prisma.land.delete({ where: { id: land.id } });
  files.images.forEach((f) => removeUpload(f.url));
  await Promise.all(files.documents.map((d) => privateStorage.remove(d.storageKey)));
  await audit({ action: 'LAND_DELETED', entityType: 'Land', entityId: land.id, req });
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Images & documents
// ---------------------------------------------------------------------------

router.post('/:id/images', authenticate, imageUpload.array('images', MAX_IMAGES), async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const cleanup = () => files.forEach((f) => removeUpload(f.filename));
  try {
    const land = await ownedLand(param(req, 'id'), currentUser(req).id);
    assertEditable(land.status);
    if (files.length === 0) throw badRequest('FILE_REQUIRED', 'At least one image is required');
    const existing = await prisma.landImage.count({ where: { landId: land.id } });
    if (existing + files.length > MAX_IMAGES) throw badRequest('TOO_MANY_IMAGES', `Maximum ${MAX_IMAGES} images`);
    await prisma.landImage.createMany({
      data: files.map((f, i) => ({ landId: land.id, url: publicPath(f.filename), position: existing + i })),
    });
  } catch (err) {
    cleanup();
    throw err;
  }
  const images = await prisma.landImage.findMany({ where: { landId: param(req, 'id') }, orderBy: { position: 'asc' } });
  res.status(201).json({ images });
});

router.delete('/:id/images/:imageId', authenticate, async (req, res) => {
  const land = await ownedLand(param(req, 'id'), currentUser(req).id);
  assertEditable(land.status);
  const image = await prisma.landImage.findFirst({ where: { id: param(req, 'imageId'), landId: land.id } });
  if (!image) throw notFound();
  await prisma.landImage.delete({ where: { id: image.id } });
  removeUpload(image.url);
  res.status(204).end();
});

const documentBody = z.object({
  type: z.enum(['TITLE_DEED', 'SURVEY_PLAN', 'TAX_RECEIPT', 'ID_DOCUMENT', 'OTHER']),
  name: z.string().trim().max(120).optional(),
});

/** Documents go to private storage: they can only be opened through a signed link (see below). */
router.post('/:id/documents', authenticate, privateUpload.single('document'), async (req, res) => {
  const file = req.file;
  try {
    const land = await ownedLand(param(req, 'id'), currentUser(req).id);
    assertEditable(land.status);
    if (!file) throw badRequest('FILE_REQUIRED', 'A document file is required');
    const body = documentBody.parse(req.body);
    const stored = await storePrivate(file);
    const document = await prisma.landDocument.create({
      data: {
        landId: land.id,
        type: body.type,
        name: body.name || file.originalname,
        storageKey: stored.key,
        mimeType: file.mimetype,
        sha256: stored.sha256,
      },
    });
    res.status(201).json({ document });
  } catch (err) {
    discardIncoming(file);
    throw err;
  }
});

router.delete('/:id/documents/:documentId', authenticate, async (req, res) => {
  const land = await ownedLand(param(req, 'id'), currentUser(req).id);
  assertEditable(land.status);
  const doc = await prisma.landDocument.findFirst({
    where: { id: param(req, 'documentId'), landId: land.id },
    omit: { storageKey: false },
  });
  if (!doc) throw notFound();
  await prisma.landDocument.delete({ where: { id: doc.id } });
  await privateStorage.remove(doc.storageKey);
  res.status(204).end();
});

/**
 * A temporary link to open one document (owner, notaries and admins only).
 * Every access is written to the audit log.
 */
router.get('/:id/documents/:documentId/link', authenticate, async (req, res) => {
  const land = await prisma.land.findUnique({ where: { id: param(req, 'id') } });
  if (!land) throw notFound('LAND_NOT_FOUND', 'Land not found');
  if (!canDownloadDocuments(land, req.user)) throw forbidden('DOCUMENT_ACCESS_DENIED', 'You cannot open this document');
  const doc = await prisma.landDocument.findFirst({
    where: { id: param(req, 'documentId'), landId: land.id },
    omit: { storageKey: false },
  });
  if (!doc) throw notFound('DOCUMENT_NOT_FOUND', 'Document not found');
  const link = privateStorage.signedUrl(doc.storageKey);
  await audit({ action: 'DOCUMENT_OPENED', entityType: 'Land', entityId: land.id, metadata: { documentId: doc.id, type: doc.type }, req });
  res.json(link);
});

// ---------------------------------------------------------------------------
// Boundary (parcel outline) & overlap checks
// ---------------------------------------------------------------------------

const boundaryBody = z.object({
  coordinates: z
    .array(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]))
    .min(3)
    .max(500),
});

function assertBoundaryEditable(land: { status: string; boundaryOnChain: boolean }) {
  if (land.boundaryOnChain) throw badRequest('BOUNDARY_LOCKED', 'The boundary is recorded on the blockchain and cannot change');
  assertEditable(land.status);
}

/** Saves the drawn outline. Overlaps are returned (not rejected) so the seller can fix the drawing. */
router.put('/:id/boundary', authenticate, validateBody(boundaryBody), async (req, res) => {
  const land = await ownedLand(param(req, 'id'), currentUser(req).id);
  assertBoundaryEditable(land);
  const b = buildBoundary((req.body as z.infer<typeof boundaryBody>).coordinates);
  const updated = await prisma.land.update({
    where: { id: land.id },
    data: {
      boundary: b.geometry as unknown as Prisma.InputJsonValue,
      boundaryHash: b.hash,
      boundaryAreaSqm: b.areaSqm,
      ...b.bbox,
      ...b.centroid,
    },
    include: landDetailInclude,
  });
  const overlaps = await findOverlaps(b.geometry, land.id);
  res.json({ land: updated, overlaps, areaCheck: areaCheck(land.areaSqm, b.areaSqm) });
});

router.delete('/:id/boundary', authenticate, async (req, res) => {
  const land = await ownedLand(param(req, 'id'), currentUser(req).id);
  assertBoundaryEditable(land);
  await prisma.land.update({
    where: { id: land.id },
    data: {
      boundary: Prisma.DbNull,
      boundaryHash: null,
      boundaryAreaSqm: null,
      minLat: null,
      maxLat: null,
      minLng: null,
      maxLng: null,
    },
  });
  res.status(204).end();
});

/** Overlap & area report for the owner and for notaries/admins reviewing the parcel. */
router.get('/:id/overlaps', authenticate, async (req, res) => {
  const land = await prisma.land.findUnique({ where: { id: param(req, 'id') } });
  if (!land) throw notFound('LAND_NOT_FOUND', 'Land not found');
  if (land.ownerId !== req.user?.id && !isStaff(req.user)) throw forbidden();
  if (!land.boundary) {
    res.json({ hasBoundary: false, overlaps: [], areaCheck: null });
    return;
  }
  const overlaps = await findOverlaps(land.boundary as unknown as BoundaryGeometry, land.id);
  res.json({ hasBoundary: true, overlaps, areaCheck: areaCheck(land.areaSqm, land.boundaryAreaSqm) });
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** Sends the listing to the notary queue. It only becomes public after notary approval. */
router.post('/:id/submit', authenticate, requireRole('CLIENT', 'ADMIN'), async (req, res) => {
  const land = await ownedLand(param(req, 'id'), currentUser(req).id);
  assertEditable(land.status);
  assertNotFrozen(land);
  const [images, documents] = await Promise.all([
    prisma.landImage.count({ where: { landId: land.id } }),
    prisma.landDocument.findMany({ where: { landId: land.id }, select: { type: true } }),
  ]);
  // Same order as the listing steps in the app: photos, boundary, documents.
  if (images === 0) throw badRequest('IMAGE_REQUIRED', 'Add at least one photo before submitting');
  if (!land.boundary) throw badRequest('BOUNDARY_REQUIRED', 'Draw the land boundary on the map before submitting');
  // First registration: the notary checks the owner's identity against the title deed.
  if (!land.registeredOnChain) {
    if (!documents.some((d) => d.type === 'TITLE_DEED')) {
      throw badRequest('TITLE_DEED_REQUIRED', 'Upload the title deed before submitting');
    }
    if (!documents.some((d) => d.type === 'ID_DOCUMENT')) {
      throw badRequest('ID_DOCUMENT_REQUIRED', "Upload the owner's identity document before submitting");
    }
  }
  const blocking = (await findOverlaps(land.boundary as unknown as BoundaryGeometry, land.id)).filter((o) => o.registeredOnChain);
  if (blocking.length > 0) {
    throw badRequest('PARCEL_OVERLAP', 'This boundary overlaps a parcel already registered on the blockchain', { overlaps: blocking });
  }
  // Last check: the listing fee (paid with mobile money) covers the notary's verification.
  const fee = await listingFeeState(land.id, land.ownerId);
  if (!fee.paid) {
    throw new AppError(402, 'LISTING_FEE_REQUIRED', 'Pay the listing fee before submitting', { amount: fee.amount, currency: fee.currency });
  }
  const updated = await prisma.land.update({
    where: { id: land.id },
    data: { status: 'PENDING_VERIFICATION', submittedAt: new Date(), rejectionReason: null },
    include: landDetailInclude,
  });
  await notifyRole('NOTARY', 'LAND_SUBMITTED', { landId: land.id, title: land.title, reference: land.reference });
  await audit({ action: 'LAND_SUBMITTED', entityType: 'Land', entityId: land.id, req });
  res.json({ land: updated });
});

/** Hides a listing. Pending offers are cancelled. Not allowed while a transfer is in progress. */
router.post('/:id/archive', authenticate, async (req, res) => {
  const land = await ownedLand(param(req, 'id'), currentUser(req).id);
  if (!['DRAFT', 'REJECTED', 'PUBLISHED', 'PENDING_VERIFICATION'].includes(land.status)) {
    throw badRequest('LAND_NOT_ARCHIVABLE', 'This listing cannot be archived now');
  }
  const pending = await prisma.offer.findMany({ where: { landId: land.id, status: 'PENDING' } });
  const visits = await prisma.visit.findMany({ where: { landId: land.id, status: { in: ['REQUESTED', 'CONFIRMED'] } } });
  await prisma.$transaction(async (tx) => {
    await tx.offer.updateMany({ where: { landId: land.id, status: 'PENDING' }, data: { status: 'CANCELLED' } });
    await tx.visit.updateMany({
      where: { id: { in: visits.map((v) => v.id) } },
      data: { status: 'DECLINED', closeReason: 'LISTING_UNAVAILABLE' },
    });
    await tx.land.update({ where: { id: land.id }, data: { status: 'ARCHIVED' } });
    for (const offer of pending) {
      await notify(offer.buyerId, 'OFFER_REJECTED', { landId: land.id, title: land.title, offerId: offer.id }, tx);
    }
    for (const v of visits) {
      await notify(v.visitorId, 'VISIT_DECLINED', { landId: land.id, title: land.title, visitId: v.id }, tx);
    }
  });
  await audit({ action: 'LAND_ARCHIVED', entityType: 'Land', entityId: land.id, req });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Favorites & reports
// ---------------------------------------------------------------------------

router.post('/:id/favorite', authenticate, async (req, res) => {
  const userId = currentUser(req).id;
  const landId = param(req, 'id');
  await prisma.favorite.upsert({
    where: { userId_landId: { userId, landId } },
    create: { userId, landId },
    update: {},
  });
  res.status(204).end();
});

router.delete('/:id/favorite', authenticate, async (req, res) => {
  await prisma.favorite.deleteMany({ where: { userId: currentUser(req).id, landId: param(req, 'id') } });
  res.status(204).end();
});

const reportBody = z.object({
  reason: z.enum(['FRAUD', 'WRONG_INFORMATION', 'DUPLICATE', 'INAPPROPRIATE', 'OTHER']),
  details: z.string().trim().max(2000).optional(),
});

router.post('/:id/reports', authenticate, validateBody(reportBody), async (req, res) => {
  const land = await prisma.land.findUnique({ where: { id: param(req, 'id') } });
  if (!land || !canViewLand(land, req.user)) throw notFound('LAND_NOT_FOUND', 'Land not found');
  const body = req.body as z.infer<typeof reportBody>;
  const report = await prisma.report.create({
    data: { landId: land.id, reporterId: currentUser(req).id, reason: body.reason, details: body.details },
  });
  await notifyRole('ADMIN', 'SYSTEM', { kind: 'NEW_REPORT', landId: land.id, title: land.title, reportId: report.id });
  res.status(201).json({ report });
});

export default router;
