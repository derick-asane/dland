/**
 * Demo data: one account per role, a few verified listings on the chain,
 * one listing waiting for the notary, and one completed sale with its ownership history.
 *
 *   admin@dland.app   / Password123!
 *   notary@dland.app  / Password123!
 *   seller@dland.app  / Password123!
 *   buyer@dland.app   / Password123!
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { LandType, Prisma, Role } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { appendBlock, ensureGenesisBlock } from '../src/blockchain/ledger';
import { sha256, walletAddressFor } from '../src/utils/crypto';
import { newKey, privateFilePath } from '../src/lib/storage';
import { buildBoundary, type Position } from '../src/lib/geo';

const PASSWORD = 'Password123!';

async function upsertUser(email: string, firstName: string, lastName: string, role: Role, extra: Record<string, string> = {}) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const id = randomUUID();
  return prisma.user.create({
    data: {
      id,
      email,
      firstName,
      lastName,
      role,
      passwordHash: await bcrypt.hash(PASSWORD, 12),
      walletAddress: walletAddressFor(id),
      city: 'Douala',
      country: 'Cameroon',
      ...extra,
    },
  });
}

function seedDocument(name: string) {
  const content = `DLand demo document: ${name}\nGenerated ${new Date().toISOString()}\n`;
  // Documents are private: written to private storage and referenced by key.
  const storageKey = newKey(`${name}.txt`);
  fs.writeFileSync(privateFilePath(storageKey), content);
  return { storageKey, sha256: sha256(content), mimeType: 'text/plain' };
}

/** A square parcel centred on (lat, lng) whose area matches the declared area. */
function squareBoundary(lat: number, lng: number, areaSqm: number) {
  const half = Math.sqrt(areaSqm) / 2;
  const dLat = half / 111_320;
  const dLng = half / (111_320 * Math.cos((lat * Math.PI) / 180));
  const ring: Position[] = [
    [lng - dLng, lat - dLat],
    [lng + dLng, lat - dLat],
    [lng + dLng, lat + dLat],
    [lng - dLng, lat + dLat],
  ];
  const b = buildBoundary(ring);
  return {
    fields: {
      boundary: b.geometry as unknown as Prisma.InputJsonValue,
      boundaryHash: b.hash,
      boundaryAreaSqm: b.areaSqm,
      ...b.bbox,
      ...b.centroid,
    },
    chain: { boundaryHash: b.hash, measuredAreaSqm: b.areaSqm },
  };
}

interface SeedLand {
  title: string;
  description: string;
  price: number;
  areaSqm: number;
  landType: LandType;
  city: string;
  address: string;
  parcelNumber: string;
  latitude: number;
  longitude: number;
}

const lands: SeedLand[] = [
  {
    title: 'Sea-view residential plot in Bonapriso',
    description: 'Flat, fenced plot with road access, water and electricity at the boundary. Ideal for a family villa.',
    price: 85000,
    areaSqm: 600,
    landType: 'RESIDENTIAL',
    city: 'Douala',
    address: 'Rue Njo-Njo, Bonapriso',
    parcelNumber: 'LT-DLA-000123',
    latitude: 4.0322,
    longitude: 9.6952,
  },
  {
    title: 'Agricultural land near Mbalmayo',
    description: 'Fertile land suitable for cocoa and plantain farming, river on the northern edge, titled.',
    price: 42000,
    areaSqm: 25000,
    landType: 'AGRICULTURAL',
    city: 'Mbalmayo',
    address: 'Route de Sangmélima, km 7',
    parcelNumber: 'LT-MBA-004512',
    latitude: 3.5167,
    longitude: 11.5,
  },
  {
    title: 'Commercial corner lot on main avenue',
    description: 'High-traffic corner lot, perfect for retail or offices. Zoning allows up to R+4.',
    price: 190000,
    areaSqm: 900,
    landType: 'COMMERCIAL',
    city: 'Yaoundé',
    address: 'Avenue Kennedy',
    parcelNumber: 'LT-YDE-010077',
    latitude: 3.8667,
    longitude: 11.5167,
  },
];

async function main() {
  await ensureGenesisBlock();

  const admin = await upsertUser('admin@dland.app', 'Ada', 'Admin', 'ADMIN');
  const notary = await upsertUser('notary@dland.app', 'Nora', 'Notaire', 'NOTARY', {
    licenseNumber: 'NOT-CM-2021-0042',
    // Demo escrow account shown to buyers as payment instructions
    escrowBankName: 'Afriland First Bank',
    escrowAccountName: 'Etude Me Nora Notaire - Compte sequestre',
    escrowAccountNumber: 'CM21 10005 00001 12345678901 23',
    escrowMobileMoney: '+237 650 00 00 00',
  });
  const seller = await upsertUser('seller@dland.app', 'Samuel', 'Seller', 'CLIENT', { bio: 'Family land owner since 1998.' });
  const buyer = await upsertUser('buyer@dland.app', 'Bella', 'Buyer', 'CLIENT');

  if ((await prisma.land.count()) > 0) {
    console.log('Lands already seeded, skipping.');
    return;
  }

  // Verified, published listings registered on the chain.
  const created = [];
  for (const [i, l] of lands.entries()) {
    const doc = seedDocument(`title-deed-${i + 1}`);
    const parcel = squareBoundary(l.latitude, l.longitude, l.areaSqm);
    const land = await prisma.$transaction(async (tx) => {
      const land = await tx.land.create({
        data: {
          ...l,
          ...parcel.fields,
          boundaryOnChain: true,
          reference: `DL-2026-SEED${i + 1}`,
          currency: 'USD',
          country: 'Cameroon',
          region: null,
          titleDeedNumber: `TF-${1000 + i}`,
          ownerId: seller.id,
          notaryId: notary.id,
          status: 'PUBLISHED',
          registeredOnChain: true,
          submittedAt: new Date(),
          publishedAt: new Date(),
          images: {
            create: [0, 1, 2].map((p) => ({ url: `https://picsum.photos/seed/dland-${i}-${p}/900/600`, position: p })),
          },
          documents: { create: [{ type: 'TITLE_DEED', name: 'Title deed', ...doc }] },
          verifications: { create: [{ notaryId: notary.id, decision: 'APPROVED', comment: 'Documents verified at the land registry.' }] },
        },
      });
      await appendBlock(tx, {
        type: 'LAND_REGISTERED',
        landId: land.id,
        signerId: notary.id,
        data: {
          landReference: land.reference,
          parcelNumber: land.parcelNumber,
          titleDeedNumber: land.titleDeedNumber,
          country: land.country,
          city: land.city,
          areaSqm: land.areaSqm,
          owner: seller.walletAddress,
          notary: notary.walletAddress,
          documents: [{ type: 'TITLE_DEED', sha256: doc.sha256 }],
          ...parcel.chain,
        },
      });
      return land;
    });
    created.push(land);
  }

  // A completed sale: the third land now belongs to the buyer, with a transfer block.
  const sold = created[2];
  await prisma.$transaction(async (tx) => {
    const offer = await tx.offer.create({
      data: { landId: sold.id, buyerId: buyer.id, amount: 185000, status: 'ACCEPTED', message: 'Serious buyer, ready to close.' },
    });
    const transfer = await tx.transfer.create({
      data: {
        landId: sold.id,
        offerId: offer.id,
        sellerId: seller.id,
        buyerId: buyer.id,
        notaryId: notary.id,
        price: 185000,
        currency: 'USD',
        status: 'PENDING_NOTARY',
      },
    });
    const block = await appendBlock(tx, {
      type: 'OWNERSHIP_TRANSFERRED',
      landId: sold.id,
      signerId: notary.id,
      data: {
        landReference: sold.reference,
        parcelNumber: sold.parcelNumber,
        country: sold.country,
        from: seller.walletAddress,
        to: buyer.walletAddress,
        price: '185000',
        currency: 'USD',
        boundaryHash: sold.boundaryHash,
        transferId: transfer.id,
        notary: notary.walletAddress,
      },
    });
    await tx.transfer.update({
      where: { id: transfer.id },
      data: { status: 'COMPLETED', blockId: block.id, completedAt: new Date(), notaryNote: 'Payment confirmed.' },
    });
    await tx.land.update({ where: { id: sold.id }, data: { ownerId: buyer.id, status: 'SOLD' } });
    await tx.review.create({
      data: { transferId: transfer.id, sellerId: seller.id, authorId: buyer.id, rating: 5, comment: 'Smooth and transparent sale.' },
    });
  });

  // A listing waiting in the notary queue.
  const pendingDoc = seedDocument('title-deed-pending');
  await prisma.land.create({
    data: {
      reference: 'DL-2026-SEED4',
      title: 'Hillside plot in Buea',
      description: 'Gently sloping plot with a view of Mount Cameroon, 10 minutes from the university.',
      price: 30000,
      currency: 'USD',
      areaSqm: 450,
      landType: 'RESIDENTIAL',
      address: 'Molyko',
      city: 'Buea',
      country: 'Cameroon',
      parcelNumber: 'LT-BUE-000871',
      ...squareBoundary(4.1537, 9.2920, 450).fields,
      titleDeedNumber: 'TF-2001',
      ownerId: seller.id,
      status: 'PENDING_VERIFICATION',
      submittedAt: new Date(),
      images: { create: [{ url: 'https://picsum.photos/seed/dland-buea/900/600', position: 0 }] },
      documents: { create: [{ type: 'TITLE_DEED', name: 'Title deed', ...pendingDoc }] },
    },
  });

  await prisma.offer.create({
    data: { landId: created[0].id, buyerId: buyer.id, amount: 80000, message: 'Would you accept 80k?' },
  });
  await prisma.notification.create({
    data: { userId: seller.id, type: 'OFFER_RECEIVED', data: { landId: created[0].id, title: created[0].title, amount: 80000, currency: 'USD' } },
  });
  await prisma.auditLog.create({ data: { actorId: admin.id, action: 'SEED', entityType: 'System' } });

  console.log('Seed complete. Accounts (password: %s):', PASSWORD);
  console.log('  admin@dland.app, notary@dland.app, seller@dland.app, buyer@dland.app');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
