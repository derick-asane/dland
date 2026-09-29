export type Role = 'CLIENT' | 'NOTARY' | 'ADMIN';
export type Language = 'en' | 'fr' | 'es';
export type LandType = 'RESIDENTIAL' | 'COMMERCIAL' | 'AGRICULTURAL' | 'INDUSTRIAL' | 'MIXED';
export type LandStatus =
  | 'DRAFT'
  | 'PENDING_VERIFICATION'
  | 'REJECTED'
  | 'PUBLISHED'
  | 'UNDER_OFFER'
  | 'SOLD'
  | 'ARCHIVED';
export type DocumentType = 'TITLE_DEED' | 'SURVEY_PLAN' | 'TAX_RECEIPT' | 'ID_DOCUMENT' | 'OTHER';
export type OfferStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN' | 'CANCELLED';
export type TransferStatus = 'PENDING_NOTARY' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type TransferStepType = 'DEPOSIT' | 'BALANCE' | 'DEED_SIGNED' | 'REGISTERED';
export type TransferStepStatus = 'PENDING' | 'SUBMITTED' | 'CONFIRMED' | 'REJECTED';
export type BlockType =
  | 'GENESIS'
  | 'LAND_REGISTERED'
  | 'OWNERSHIP_TRANSFERRED'
  | 'BOUNDARY_RECORDED'
  | 'PAYMENT_CONFIRMED'
  | 'REGISTRY_RECORDED';

/** GeoJSON Polygon; positions are [longitude, latitude]. */
export interface Boundary {
  type: 'Polygon';
  coordinates: [number, number][][];
}
export type ReportStatus = 'OPEN' | 'RESOLVED' | 'DISMISSED';

export interface PublicUser {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  city: string | null;
  country: string | null;
  role: Role;
  walletAddress: string;
  createdAt: string;
  bio?: string | null;
}

export interface User extends PublicUser {
  email: string;
  phone: string | null;
  bio: string | null;
  language: Language;
  isActive: boolean;
  licenseNumber: string | null;
  escrowBankName: string | null;
  escrowAccountName: string | null;
  escrowAccountNumber: string | null;
  escrowMobileMoney: string | null;
  updatedAt: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface LandImage {
  id: string;
  url: string;
  position: number;
}

export interface LandDocument {
  id: string;
  type: DocumentType;
  name: string;
  /** Only the owner, notaries and admins can open documents (through a short-lived signed link). */
  canOpen?: boolean;
  mimeType: string;
  sha256: string;
  createdAt: string;
}

export interface Verification {
  id: string;
  decision: 'APPROVED' | 'REJECTED';
  comment: string | null;
  createdAt: string;
  notary: PublicUser;
}

export interface Land {
  id: string;
  reference: string;
  title: string;
  description: string;
  price: string;
  currency: string;
  areaSqm: number;
  landType: LandType;
  address: string;
  city: string;
  region: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  parcelNumber: string;
  titleDeedNumber: string;
  status: LandStatus;
  ownerId: string;
  owner: PublicUser;
  notary?: (PublicUser & { licenseNumber: string | null }) | null;
  rejectionReason: string | null;
  registeredOnChain: boolean;
  boundary: Boundary | null;
  boundaryHash: string | null;
  boundaryAreaSqm: number | null;
  boundaryOnChain: boolean;
  submittedAt: string | null;
  publishedAt: string | null;
  viewsCount: number;
  createdAt: string;
  updatedAt: string;
  images: LandImage[];
  documents?: LandDocument[];
  verifications?: Verification[];
  isFavorite?: boolean;
  isOwner?: boolean;
  myOffer?: Offer | null;
  _count?: { favorites: number; offers?: number };
}

export interface Offer {
  id: string;
  landId: string;
  buyerId: string;
  amount: string;
  message: string | null;
  status: OfferStatus;
  createdAt: string;
  land?: Land;
  buyer?: PublicUser;
  transfer?: Transfer | null;
}

export interface BlockSummary {
  index: number;
  hash: string;
  timestamp: string;
  anchorTxHash: string | null;
}

export interface Transfer {
  id: string;
  landId: string;
  offerId: string | null;
  sellerId: string;
  buyerId: string;
  notaryId: string | null;
  price: string;
  currency: string;
  status: TransferStatus;
  notaryNote: string | null;
  createdAt: string;
  completedAt: string | null;
  land: Land;
  seller: PublicUser & { email?: string; phone?: string | null };
  buyer: PublicUser & { email?: string; phone?: string | null };
  notary:
    | (PublicUser & {
        phone?: string | null;
        email?: string;
        licenseNumber?: string | null;
        escrowBankName?: string | null;
        escrowAccountName?: string | null;
        escrowAccountNumber?: string | null;
        escrowMobileMoney?: string | null;
      })
    | null;
  block: BlockSummary | null;
  review: Review | null;
  /** Payment reference the buyer writes on the transfer, e.g. DL-TR-1A2B3C4D */
  reference?: string;
  claimedAt: string | null;
  deedReference: string | null;
  registryReference: string | null;
  registeredAt: string | null;
  steps?: TransferStep[];
}

export interface TransferStep {
  id: string;
  type: TransferStepType;
  position: number;
  status: TransferStepStatus;
  amount: string | null;
  proofName: string | null;
  proofSha256: string | null;
  paymentReference: string | null;
  submittedAt: string | null;
  confirmedAt: string | null;
  note: string | null;
  block?: { index: number; hash: string } | null;
}

export interface Review {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  author?: PublicUser;
}

export interface Block {
  id: string;
  index: number;
  timestamp: string;
  type: BlockType;
  landId: string | null;
  data: Record<string, unknown>;
  dataHash: string;
  previousHash: string;
  nonce: number;
  hash: string;
  signature: string;
  anchorTxHash: string | null;
  land?: { id: string; reference: string; title: string } | null;
  signer?: { id: string; firstName: string; lastName: string; walletAddress: string } | null;
  verified?: boolean;
  problems?: string[];
}

export interface LandHistory {
  land: { id: string; reference: string; title: string };
  valid: boolean;
  blocks: Block[];
  parties: { id: string; firstName: string; lastName: string; walletAddress: string; avatarUrl: string | null }[];
}

export interface Certificate {
  reference: string;
  title: string;
  parcelNumber: string;
  titleDeedNumber: string;
  city: string;
  country: string;
  areaSqm: number;
  owner: { id: string; firstName: string; lastName: string; walletAddress: string };
  boundaryHash: string | null;
  boundaryAreaSqm: number | null;
  ownerMatchesChain: boolean;
  chainValid: boolean;
  registration: { index: number; hash: string; timestamp: string } | null;
  lastTransfer: { index: number; hash: string; timestamp: string } | null;
  transfersCount: number;
  issuedAt: string;
}

export interface Conversation {
  id: string;
  landId: string;
  buyerId: string;
  sellerId: string;
  updatedAt: string;
  land: { id: string; title: string; reference: string; images: LandImage[] };
  buyer: PublicUser;
  seller: PublicUser;
  lastMessage?: Message | null;
  unreadCount?: number;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export type NotificationType =
  | 'LAND_SUBMITTED'
  | 'LAND_APPROVED'
  | 'LAND_REJECTED'
  | 'OFFER_RECEIVED'
  | 'OFFER_ACCEPTED'
  | 'OFFER_REJECTED'
  | 'OFFER_WITHDRAWN'
  | 'TRANSFER_PENDING'
  | 'TRANSFER_COMPLETED'
  | 'TRANSFER_CANCELLED'
  | 'NEW_MESSAGE'
  | 'NEW_REVIEW'
  | 'TRANSFER_CLAIMED'
  | 'PAYMENT_PROOF_SUBMITTED'
  | 'PAYMENT_CONFIRMED'
  | 'PAYMENT_REJECTED'
  | 'TITLE_REGISTERED'
  | 'SYSTEM';

export interface AppNotification {
  id: string;
  type: NotificationType;
  data: Record<string, string | number | null> | null;
  readAt: string | null;
  createdAt: string;
}

export interface Report {
  id: string;
  reason: string;
  details: string | null;
  status: ReportStatus;
  createdAt: string;
  land: Land;
  reporter: PublicUser;
}

export interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  ip: string | null;
  createdAt: string;
  actor: { id: string; firstName: string; lastName: string; role: Role } | null;
}

export interface AdminStats {
  usersByRole: Partial<Record<Role, number>>;
  landsByStatus: Partial<Record<LandStatus, number>>;
  transfersByStatus: Partial<Record<TransferStatus, number>>;
  salesVolume: { currency: string; total: string }[];
  openReports: number;
  blocks: number;
  newUsersLast30Days: number;
  recentActivity: AuditLog[];
}

export interface MyStats {
  landsByStatus: Partial<Record<LandStatus, number>>;
  totalViews: number;
  pendingOffersReceived: number;
  offersSent: number;
  favorites: number;
  ownedOnChain: number;
  unreadNotifications: number;
}

export interface ChainVerification {
  valid: boolean;
  blocks: number;
  lastHash: string | null;
  issues: { index: number; hash: string; problem: string }[];
  checkedAt: string;
}

export interface Overlap {
  landId: string;
  reference: string;
  title: string;
  status: LandStatus;
  registeredOnChain: boolean;
  overlapSqm: number;
  overlapPct: number;
}

export interface AreaCheck {
  declaredSqm: number;
  measuredSqm: number;
  diffPct: number;
  suspicious: boolean;
}

export interface OverlapReport {
  hasBoundary: boolean;
  overlaps: Overlap[];
  areaCheck: AreaCheck | null;
}

/** Lightweight land shape returned by GET /lands/map. */
export interface MapLand {
  id: string;
  reference: string;
  title: string;
  status: LandStatus;
  landType: LandType;
  city: string;
  areaSqm: number;
  latitude: number | null;
  longitude: number | null;
  boundary: Boundary | null;
  price?: string;
  currency?: string;
  images?: LandImage[];
}
