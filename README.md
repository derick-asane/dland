# DLand

DLand is a land marketplace where people list land for sale and others browse it.

- **A notary must verify every listing before it goes public.**
- **Every registration and every change of owner is written to a blockchain ledger,** so anyone can trace how a parcel moved from one person to the next.

| Folder | Stack |
| --- | --- |
| [`backend/`](backend/) | Node.js, Express 5, TypeScript, Prisma, PostgreSQL |
| [`frontend/`](frontend/) | React Native (Expo SDK 57, Expo Router), TypeScript, TanStack Query, i18next |
| [`blockchain/contracts/`](blockchain/contracts/) | Optional Solidity contract for anchoring block hashes on a public EVM chain |

## Roles

| Role | Can do |
| --- | --- |
| **Client** | Anyone who signs up; the same person can sell and buy. **List land:** a guided flow of details → photos → draw the plot on the map → title deed and ID → submit to a notary. **Buy land:** search and filter, save favorites, message owners, make offers, follow the sale file, rate the seller. Also: view ownership history and certificates, and see listing statistics. |
| **Notary** | Review the verification queue and approve (which registers the land on the chain) or reject. Take sale files, show buyers their escrow account, confirm or reject payment receipts, record the deed signing (ownership block) and the land registry reference, or cancel a sale. Notaries cannot notarize their own land or sales. |
| **Admin** | Oversee the whole platform: dashboard and KPIs, users (change roles, create notaries, suspend accounts), fraud reports, taking listings down, all listings and transfers, chain integrity checks, and a full audit log |

## Listing and sale lifecycle

```
Owner (a client) lists land in 5 steps: details → photos → plot drawn on the map
→ title deed + owner's ID → submit ──────────────────────────────► PENDING_VERIFICATION
                                                                        │
                                   notary rejects ◄─────────────────────┤
                                   (REJECTED: owner edits and resubmits)  │ notary approves
                                                                        ▼
                               ⛓ block LAND_REGISTERED ──► PUBLISHED (visible to everyone)
                                                                        │ buyer offers, seller accepts
                                                                        ▼
                                                   UNDER_OFFER + sale file PENDING_NOTARY
                                                                        │ a notary takes the file
                                                                        ▼
                     IN_PROGRESS: buyer pays the notary's escrow account OFF-PLATFORM
                     and uploads each receipt (deposit, balance); the notary confirms
                     each one ──► ⛓ block PAYMENT_CONFIRMED (receipt fingerprint)
                                                                        │ all paid, deed signed
                                                                        ▼
                            ⛓ block OWNERSHIP_TRANSFERRED ──► SOLD (the buyer is the new owner
                                                                     and can re-list later)
                                                                        │ sale registered at the land registry
                                                                        ▼
                                                      ⛓ block REGISTRY_RECORDED
```

## Payments: DLand never holds money

A land sale is a notarial deed registered with the land registry; an app can't replace that. Holding buyers' money would also require a payment or banking licence. So **DLand facilitates the sale but never receives the money**:

1. **The notary takes the file.** They set the deposit (10% of the price by default, 0 for a single payment). Their **escrow account** (bank, account number, Mobile Money) is shown to the buyer with a payment reference such as `DL-TR-1A2B3C4D`.
2. **The buyer pays outside the app** and uploads each receipt (PDF or photo) with their bank or Mobile Money transaction reference.
3. **The notary checks each receipt** and confirms it or rejects it with a reason; after a rejection, the buyer uploads a new one. Each confirmation writes a `PAYMENT_CONFIRMED` block holding the receipt's SHA-256 fingerprint.
4. **Deed signed.** Once every payment is confirmed, the notary enters the deed reference. Ownership moves to the buyer in an `OWNERSHIP_TRANSFERRED` block.
5. **Land registry.** Once the sale is registered, the notary records the registry reference, plus a new title number if one was issued, in a `REGISTRY_RECORDED` block.

Buyer, seller and notary follow the whole file on one screen. The app repeatedly tells users to pay only into the notary's escrow account.

Notaries enter their escrow account under **Profile → Escrow account** before they can take files. Confirm the exact steps with a local notary or lawyer before launch.

## How the blockchain works

DLand runs a **permissioned, proof-of-authority ledger** stored in Postgres (`Block` table, [`backend/src/blockchain/ledger.ts`](backend/src/blockchain/ledger.ts)):

- **Hash-linked blocks.** Each block stores `previousHash`, and its own `hash = SHA-256(index | timestamp | type | previousHash | dataHash | nonce)`. Changing any past block breaks every block after it.
- **Canonical payload.** `dataHash` is the SHA-256 of canonical JSON (keys sorted). A block records the parcel reference, its cadastral IDs, the owner and notary wallet addresses, the price, and the **SHA-256 fingerprint of every uploaded document**.
- **Privacy.** Users appear on the chain only as pseudonymous wallet addresses, never with personal data.
- **Proof-of-work.** Each block has a light proof-of-work (`CHAIN_DIFFICULTY` leading zeros).
- **Signatures.** Each block is **signed with Ed25519** by the registry. The public key is published at `GET /api/chain/public-key`.
- **Atomic writes.** Blocks are appended in the **same database transaction** as the business change (for example the ownership update), serialized with a Postgres advisory lock. Ownership and chain can never disagree.
- **Verification.** `GET /api/chain/verify` (or `npm run chain:verify`) re-checks every hash, link and signature. In testing, changing the price stored in one past block was immediately reported as `DATA_HASH_MISMATCH`.
- **Optional public anchoring.** Set `ANCHOR_ENABLED=true` to write each block hash to [`DlandAnchor.sol`](blockchain/contracts/DlandAnchor.sol) on any EVM chain (for example Polygon Amoy). This makes the ledger tamper-evident even against the platform operator.

In the app, each verified land has an **ownership history timeline** and an **ownership certificate with a QR code**. The QR code points at the public verification endpoint, so anyone can check it without an account.

## Parcel boundaries and overlap detection

Every listing has a **boundary**: in step 3 of the listing flow, the owner draws the plot's outline on a map (satellite or street view) by tapping each corner.

- **Measured area.** The API measures the real area of the outline and compares it with the declared area. A difference of more than 10% is flagged for the notary.
- **Overlap detection.** The outline is checked against every parcel already registered on the chain, and every listing waiting for a notary. It's a fast bounding-box filter, then a precise polygon intersection with [Turf.js](https://turfjs.org), so no PostGIS extension is needed.
  - **An overlap with a registered parcel blocks the listing.** It can't be submitted, the notary can't approve it, and the API enforces this even if the app is bypassed.
  - An overlap with another pending listing is shown to the notary as a warning.
  - Neighbours that only share an edge are not counted as overlapping.
- **On the chain.** The boundary's SHA-256 fingerprint and measured area are written into the `LAND_REGISTERED` block, and the boundary is then locked. A land registered before it had an outline gets a `BOUNDARY_RECORDED` block when a notary approves its newly drawn boundary.
- **Maps in the app:**
  - A map view on Explore with price pins and outlines.
  - A map on every listing.
  - A boundary check for notaries: the map with registered neighbours, overlaps in red, and the area check.

## Other features

- **Translations** in English, French and Spanish.
  - The first launch uses the device language; the chosen language is saved on the user's profile and follows them across devices.
  - API errors and notifications are sent as codes and translated in the app.
  - Translation keys are type-checked: a missing key fails `tsc`.
- **Profiles**
  - Your own profile: avatar, bio, contact details and personal stats.
  - Public profile: rating, reviews, completed sales and active listings.
- **Search and filters**: text, city, land type, price and area ranges, and sorting.
- **Messaging** between buyer and seller, one conversation per land.
- **Notifications** for every step of the flow (offer received, listing approved, transfer completed…).
- **Reviews**: buyers rate the seller after a completed sale.
- **Reports**: anyone can flag a suspicious listing; admins act on it.
- **Security**
  - JWT access tokens with rotating refresh tokens stored in SecureStore; reusing a refresh token revokes the whole session.
  - Rate limiting on auth, bcrypt password hashing, file-type and size checks on uploads.
  - Suspended users are blocked immediately.
  - **Private documents.** Title deeds, ID documents and payment receipts are stored in `backend/storage/private/`, outside the public `/uploads`, so no URL exposes them.
    - To open one, the app asks the API. The API checks permissions (owner, notaries, admins; for receipts, the buyer, seller and assigned notary) and returns a **signed link valid for 5 minutes**.
    - Each opening is written to the admin audit log.
    - Buyers see only the documents' fingerprints.
    - Storage keys are never included in API responses.
    - Only land photos and profile pictures are public.
    - The storage sits behind a small interface (`backend/src/lib/storage.ts`), so moving to S3 or another cloud store means adding one implementation.
- **Password reset** by 6-digit code. In development the code is printed in the API console, because no email or SMS provider is connected yet.

## Getting started

### 1. Database

Use any PostgreSQL 14+ database. With Docker:

```bash
docker compose up -d        # Postgres on localhost:5432 (user/password/db: dland)
```

### 2. Backend

```bash
cd backend
cp .env.example .env        # then edit it (see below)
npm install
npx prisma migrate deploy   # creates the tables
npm run seed                # demo accounts + sample lands + chain history
npm run dev                 # http://localhost:4000
```

Settings in `backend/.env`:

- `DATABASE_URL`: your Postgres connection string.
- `PORT`: the API port. The default is `4000`; change it if something else already uses that port.
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`: set long random strings.
- `CHAIN_SIGNER_PRIVATE_KEY_B64`: leave empty in development and a signing key is generated in `backend/.keys/`. In production it is required: an Ed25519 PKCS#8 PEM, base64-encoded.
  - **Back up this key.** Every block is signed with it. If it is lost or replaced, all existing blocks fail verification with `BAD_SIGNATURE`.

### 3. Mobile app

```bash
cd frontend
cp .env.example .env        # set EXPO_PUBLIC_API_URL=http://<your-computer-LAN-IP>:<PORT>
npm install
npx expo start              # scan the QR code with Expo Go, or press a / i for an emulator
```

**In a web browser:** set `EXPO_PUBLIC_API_URL=http://localhost:<PORT>` and run `npx expo start --web` (add `--port 8090` if 8081 is busy). The same app runs in the browser. Messages use the browser's alert dialog, and photo and document pickers use the browser's file chooser.

A physical phone cannot reach `localhost`. Use your computer's LAN IP (run `ipconfig` on Windows), and make sure the phone and computer are on the same Wi-Fi network.

### Demo accounts (after `npm run seed`)

All four use the password `Password123!`.

| Email | Role |
| --- | --- |
| `admin@dland.app` | Admin |
| `notary@dland.app` | Notary |
| `seller@dland.app` | Client (Samuel). Owns the demo listings. |
| `buyer@dland.app` | Client (Bella). Already owns one land bought from Samuel, so its history shows a transfer. |

## Useful commands

| Where | Command | What it does |
| --- | --- | --- |
| backend | `npm run dev` | API with auto-reload |
| backend | `npm run typecheck` / `npm run build` | Type-check / compile to `dist/` |
| backend | `npm run chain:verify` | Verify the whole ledger (exit code 1 if tampered) |
| backend | `npx prisma studio` | Browse the database |
| frontend | `npm run typecheck` | Type-check, including the translation keys |
| frontend | `npm run lint` | ESLint (expo config) |

## API overview

All routes are under `/api`.

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/register` · `/login` · `/refresh` · `/logout` · `/forgot-password` · `/reset-password` · `/change-password`, `GET /auth/me` |
| Users | `PATCH /users/me` · `POST /users/me/avatar` · `GET /users/me/stats` · `GET /users/:id` · `GET /users/:id/reviews` |
| Lands | `GET /lands` (search) · `GET /lands/mine` · `GET /lands/favorites` · `GET/POST/PATCH/DELETE /lands/:id` · `POST /lands/:id/images` · `/documents` · `/submit` · `/archive` · `/favorite` · `/reports` |
| Maps and boundaries | `GET /lands/map?minLat&maxLat&minLng&maxLng[&layer=registry]` · `PUT/DELETE /lands/:id/boundary` · `GET /lands/:id/overlaps` |
| Offers | `POST /offers` · `GET /offers/sent` · `/received` · `POST /offers/:id/accept` · `/reject` · `/withdraw` |
| Sale files | `GET /transfers/mine` · `GET /transfers/:id` · `POST /transfers/:id/steps/:stepId/proof` (buyer's receipt) · `POST /transfers/:id/review` |
| Notary | `GET /notary/lands` · `POST /notary/lands/:id/approve` · `/reject` · `PATCH /notary/escrow` · `GET /notary/transfers?view=new\|active\|done` · `POST /notary/transfers/:id/claim` · `/steps/:stepId/confirm` · `/steps/:stepId/reject` · `/complete` (deed) · `/registry` · `/cancel` |
| Messaging | `GET/POST /conversations` · `GET/POST /conversations/:id/messages` |
| Notifications | `GET /notifications` · `GET /notifications/unread-count` · `POST /notifications/:id/read` · `/read-all` |
| Chain (public) | `GET /chain/blocks` · `/blocks/:hash` · `/verify` · `/public-key` · `/lands/:id/history` · `/certificate/:reference` |
| Admin | `GET /admin/stats` · users (`GET/POST/PATCH`) · `GET /admin/lands` · `POST /admin/lands/:id/suspend` · `GET /admin/transfers` · reports · `GET /admin/audit-logs` |

## Known limitations and next steps

- **File storage.** Private documents live on the API server's disk (`backend/storage/private/`). Back up that folder with the database; it is not in git. When you deploy, consider a cloud store (S3, Cloudflare R2…) through the storage interface, and set `FILES_SIGNING_SECRET`.
- **Email and SMS.** Password-reset codes are printed in the API console; connect a provider in `auth.routes.ts`.
- **Push notifications.** In-app notifications refresh every 15 to 30 seconds (polling). `expo-notifications` would add real push notifications.
- **Map tiles.** The maps use Esri's keyless street and satellite tiles and OpenStreetMap's address search (Nominatim). This is fine for development; for production, use a tile provider account (Esri, MapTiler, Mapbox…) and set the URLs in `frontend/src/components/map/leafletHtml.ts`.
- **Payments.** By design, sale money never goes through DLand (see "Payments: DLand never holds money"). Small platform fees (listing, verification, subscriptions) could later be paid in the app with Mobile Money or card, because that is your own service, not other people's money.
