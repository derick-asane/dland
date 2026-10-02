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
| **Client** | Anyone who signs up; the same person can sell and buy. **List land:** a guided flow of details → photos → draw the plot on the map → title deed and ID → submit to a notary. **Buy land:** search and filter, save favorites, message owners, request a visit, make offers, follow the sale file, rate the seller. Also: view ownership history and certificates, and see listing statistics. |
| **Notary** | Review the verification queue and approve (which registers the land on the chain) or reject. Take sale files, show buyers their escrow account, confirm or reject payment receipts, record the deed signing (ownership block) and the land registry reference, or cancel a sale. Notaries cannot notarize their own land or sales. |
| **Admin** | Oversee the whole platform: dashboard and KPIs, users (change roles, create notaries, suspend accounts), fraud reports, blocking and unblocking listings, all listings and transfers, chain integrity checks, and a full audit log |

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

## Listing fee (MTN MoMo and Orange Money)

DLand's own revenue is a **listing fee** that the owner pays with mobile money before a listing goes to the notary. It covers the verification work. This is separate from the sale money, which never goes through DLand.

- **When it's charged.** The fee is paid **once per owner per listing**. On the last step of the listing flow, a **Pay … with Mobile Money** button appears once the checklist is complete. **Submit to notary** stays disabled until the fee is paid, and the API refuses with `402 LISTING_FEE_REQUIRED`.
  - Resubmitting after a rejection is free, and so is relisting your own archived land.
  - A new owner relisting a land they bought pays again.
- **Paying**
  1. The owner enters an MTN or Orange number.
  2. DLand asks [Campay](https://www.campay.net) to collect the amount, and the network sends an approval prompt to the phone. The screen also shows the USSD code (`*126#` or `#150*50#`) in case no prompt arrives.
  3. The owner approves with their PIN. The screen follows the payment by itself and shows the result with a receipt number (`DL-PY-XXXXXXXX`). A notification is sent either way.
- **Failures.** If the payment fails (low balance, not approved within 15 minutes, number refused), the screen explains why and offers **Try again**. Only one payment can be waiting at a time.
- **Reliable status.** Campay's webhook settles payments at once; it is verified with its signature, and the status is always read back from Campay's API. Because a webhook can be lost, the API also checks pending payments every 5 seconds on its own. This background check is also what makes payments complete on a development PC that Campay cannot reach.
- **Receipts and revenue.** Owners see their receipts under **Profile → Payments**. Admins see every payment under **Admin → Payments** (filter by status), and the dashboard shows the fees collected in total and over the last 30 days. Each payment is in the audit log.

### Setting up payments

| Setting (`backend/.env`) | Meaning |
| --- | --- |
| `LISTING_FEE_AMOUNT` / `LISTING_FEE_CURRENCY` | The fee, `5000` `XAF` by default. `0` makes listing free. |
| `PAYMENT_PROVIDER` | `simulator` (default) fakes payments for development. `campay` collects for real. The API **refuses to start in production with the simulator.** |
| `CAMPAY_ENV` | `demo` (sandbox, no real money) or `live`. |
| `CAMPAY_TOKEN`, or `CAMPAY_USERNAME` + `CAMPAY_PASSWORD` | Your Campay app's API credentials. |
| `CAMPAY_WEBHOOK_KEY` | Your Campay app's webhook key, used to verify payment callbacks. |

**The simulator** approves a payment about 5 seconds after it starts. Numbers ending in **99** simulate a failed payment, for example `690000099`.

**Going live with Campay:**
1. Create an account and an app at [campay.net](https://www.campay.net); start on the demo environment.
2. Copy the app's API username/password (or permanent token) and webhook key into `.env`, and set `PAYMENT_PROVIDER=campay`.
3. In the Campay dashboard, set the webhook URL to `<PUBLIC_URL>/api/payments/webhooks/campay`. Your API must be reachable on the internet over HTTPS for this.
4. Test with the demo environment. Campay's sandbox only accepts small amounts, so set `LISTING_FEE_AMOUNT` low while testing.
5. Once Campay validates your account, set `CAMPAY_ENV=live` and the real fee.

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

## Ownership disputes

Anyone signed in can **challenge the ownership** of a land registered on the chain, using the "Challenge ownership" button on the listing.

1. **Claim.** The claimant picks a reason (the land is mine, sold more than once, forged documents, boundary conflict, inheritance, other), explains the claim in at least 20 characters, and can attach up to 5 evidence files (PDF or images).
   - Evidence is stored privately and opened through signed links.
   - Only the claimant, the owner, notaries and admins can see a dispute.
   - One open dispute per person per land.
   - The owner is notified and can post their side of the story.
2. **Review.** A notary takes the dispute from the **Disputes** tab of the notary desk.
3. **Freeze.** If the claim looks serious, the notary **freezes the land**.
   - The freeze writes a **`LAND_FROZEN` block** to the chain, with the dispute reference and reason.
   - While frozen, no offer can be made or accepted and no sale file can move forward. The API enforces this (`LAND_FROZEN` error).
   - The listing, the cards on Explore, the ownership history and the certificate all show the freeze.
4. **Decision.** The notary closes the dispute with written reasons:
   - **Dismissed:** the freeze is lifted with a **`LAND_UNFROZEN` block**.
   - **Upheld:** the land stays frozen and is taken off the market, and any offer or sale in progress is cancelled. Only a notary can lift the freeze later, citing the official decision (for example a court ruling), and that is also recorded on the chain.
   - The claimant can withdraw at any time, which lifts a freeze they caused.

Admins see every dispute under **Admin → Disputes**. Every step notifies the people involved.

## Real-time updates and push notifications

- **Instant chat.** The app keeps a [Socket.IO](https://socket.io) connection to the API, authenticated with the access token. It provides:
  - instant message delivery;
  - "… is typing" in the chat header;
  - **Seen** under your last message once the other person has read it.
- **Live notifications.** Notifications are saved in the same database transaction as the event that caused them. A small dispatcher (`backend/src/lib/dispatcher.ts`) sends them only after that transaction commits:
  - over the live connection to open apps (badges and lists refresh at once);
  - as a **push notification** to the user's phones, in their language.
  - Polling remains as a 60-second fallback.
- **Push on phones** uses `expo-notifications` and Expo's push service.
  - Users turn it on in **Settings → Notifications**.
  - Tapping a notification opens the matching screen.
  - Logging out unregisters the device.
- **In the browser,** while the app is open, notifications appear as browser notifications once the user allows them.

## Other features

- **Translations** in English, French and Spanish.
  - The first launch uses the device language; the chosen language is saved on the user's profile and follows them across devices.
  - API errors and notifications are sent as codes and translated in the app.
  - Translation keys are type-checked: a missing key fails `tsc`.
- **Profiles**
  - Your own profile: avatar, bio, contact details and personal stats.
  - Public profile: rating, reviews, completed sales and active listings.
- **Search and filters**: text, city, land type, price and area ranges, and sorting.
- **Messaging** between buyer and seller, one conversation per land, delivered instantly (see above).
- **Notifications** for every step of the flow (offer received, listing approved, transfer completed, dispute opened…), live and by push.
- **Reviews**: buyers rate the seller after a completed sale.
- **Land visits**
  - On a published listing, a client taps **Request a visit**. They pick a day and time (the next three weeks, in half-hour slots) or say they are flexible, and can add a message.
  - The owner sees "N visit requests are waiting" on the listing and under **Profile → Visits → On my lands**.
  - The owner **confirms with a date**: the visitor's wish or another time. They add the meeting point and contact details, and can change the date later.
  - Either side can call it off: the owner declines, the visitor cancels.
  - Each step notifies the other person.
  - Visits are closed automatically when the listing is archived or blocked.
- **Reports**: anyone can flag a suspicious listing; admins act on it.
- **Blocking listings (admins).** On any listing, **Administration → Block this listing**, with a reason the owner will see.
  - The listing disappears from search, the map and its public page.
  - Pending offers and visits are cancelled.
  - The owner is notified and can no longer edit, relist, resubmit or delete it. The API enforces this with `LAND_BLOCKED`.
  - A blocked listing can't be approved by a notary.
  - **Unblock** puts it back exactly as it was before the block.
  - The blockchain history is never changed.
  - Admins can list blocked listings with the **Blocked** filter on **Admin → Listings**.
  - A listing with a sale in progress can't be blocked until a notary cancels the sale.
- **Security**
  - JWT access tokens with rotating refresh tokens stored in SecureStore; reusing a refresh token revokes the whole session.
  - Rate limiting on sign-in, sign-up and password reset (not on session refresh), bcrypt password hashing, file-type and size checks on uploads.
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
npm run seed                # admin + notary accounts and the genesis block
npm run dev                 # http://localhost:4000
```

Settings in `backend/.env`:

- `DATABASE_URL`: your Postgres connection string.
- `PORT`: the API port. The default is `4000`; change it if something else already uses that port.
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`: set long random strings.
- `CHAIN_SIGNER_PRIVATE_KEY_B64`: leave empty in development and a signing key is generated in `backend/.keys/`. In production it is required: an Ed25519 PKCS#8 PEM, base64-encoded.
  - **Back up this key.** Every block is signed with it. If it is lost or replaced, all existing blocks fail verification with `BAD_SIGNATURE`.
- Listing fee and mobile money: see "Setting up payments" above. The defaults (5,000 XAF, simulator) work in development without an account.

### 3. Mobile app

```bash
cd frontend
cp .env.example .env        # set EXPO_PUBLIC_API_URL=http://<your-computer-LAN-IP>:<PORT>
npm install
npx expo start              # scan the QR code with Expo Go, or press a / i for an emulator
```

**In a web browser:** set `EXPO_PUBLIC_API_URL=http://localhost:<PORT>` and run `npx expo start --web` (add `--port 8090` if 8081 is busy). The same app runs in the browser. Messages use the browser's alert dialog, and photo and document pickers use the browser's file chooser.

A physical phone cannot reach `localhost`. Use your computer's LAN IP (run `ipconfig` on Windows), and make sure the phone and computer are on the same Wi-Fi network.

### 4. Push notifications on phones (optional)

Instant chat and live notifications work everywhere without this step. Push notifications on phones need a little setup:

1. **Development build.** Expo Go on Android can't receive push notifications (SDK 53 and later), so make a development build: `npx expo install expo-dev-client`, then `eas build --profile development`, or `npx expo run:android` / `run:ios`.
2. **Expo project.** Run `eas init`. It writes `extra.eas.projectId` to `app.json`, and the app needs that ID to get a push token.
3. **Android:** add your Firebase (FCM v1) credentials with `eas credentials`. **iOS:** EAS creates the push key when you build.
4. Then turn on **Settings → Notifications** in the app.

Until this is done, the Settings screen explains what's missing instead of failing. The API needs no keys: it sends through Expo's push service, and removes devices that Expo reports as unregistered.

### Staff accounts (after `npm run seed`)

The seed creates only the staff accounts. Both use the password `Password123!`; change it after the first sign-in. Clients create their own accounts with **Sign up**. Running the seed again leaves existing accounts untouched.

| Email | Role |
| --- | --- |
| `admin@dland.app` | Admin |
| `notary@dland.app` | Notary. Add the escrow account under **Profile → Escrow account** before taking sale files. |

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
| Disputes | `POST /disputes` (multipart, `evidence` files) · `GET /disputes/mine` · `GET /disputes?view=new\|active\|closed` (notary, admin) · `GET /disputes/:id` · `POST /disputes/:id/evidence` · `/response` (owner) · `/withdraw` (claimant) · `/take` · `/freeze` · `/resolve` (notary) · `POST /disputes/lands/:landId/unfreeze` · `GET /disputes/:id/evidence/:evidenceId/link` |
| Visits | `POST /visits` · `GET /visits?as=visitor|owner&view=active|closed` · `GET /visits/:id` · `POST /visits/:id/confirm` (owner: date + note, also reschedules) · `/decline` (owner) · `/cancel` (visitor) |
| Payments | `GET /payments/config` · `POST /payments/listing-fee` (`landId`, `phone`) · `GET /payments/:id` (status, re-checked with the provider) · `GET /payments/mine` · `GET|POST /payments/webhooks/campay` (signed by Campay) · `GET /admin/payments?status=` |
| Messaging | `GET/POST /conversations` · `GET/POST /conversations/:id/messages` |
| Notifications | `GET /notifications` · `GET /notifications/unread-count` · `POST /notifications/:id/read` · `/read-all` · `POST/DELETE /users/me/push-tokens` |
| Real time (Socket.IO, same port) | Connect with `auth: { token: <access token> }`. Server events: `message:new`, `messages:read`, `typing`, `notification:new`. Client event: `typing { conversationId }` |
| Chain (public) | `GET /chain/blocks` · `/blocks/:hash` · `/verify` · `/public-key` · `/lands/:id/history` · `/certificate/:reference` |
| Admin | `GET /admin/stats` · users (`GET/POST/PATCH`) · `GET /admin/lands[?blocked=true]` · `POST /admin/lands/:id/block` · `/unblock` · `GET /admin/transfers` · reports · `GET /admin/audit-logs` |

## Known limitations and next steps

- **File storage.** Private documents live on the API server's disk (`backend/storage/private/`). Back up that folder with the database; it is not in git. When you deploy, consider a cloud store (S3, Cloudflare R2…) through the storage interface, and set `FILES_SIGNING_SECRET`.
- **Email and SMS.** Password-reset codes are printed in the API console; connect a provider in `auth.routes.ts`.
- **Push notifications** need the one-time setup in "Push notifications on phones". The live connection runs on a single API process. To run several API instances, add the Socket.IO Redis adapter so events reach users connected to another instance.
- **Map tiles.** The maps use Esri's keyless street and satellite tiles and OpenStreetMap's address search (Nominatim). This is fine for development; for production, use a tile provider account (Esri, MapTiler, Mapbox…) and set the URLs in `frontend/src/components/map/leafletHtml.ts`.
- **Payments.** By design, sale money never goes through DLand (see "Payments: DLand never holds money"). Only the listing fee is collected, with Campay. Refunds are not automated: if a fee must be returned, send it from the Campay dashboard. A featured-listing boost could be added on the same payment system.
