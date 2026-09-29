-- One account type for everyone who lists or buys land: USER and SELLER become CLIENT.
ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM ('CLIENT', 'NOTARY', 'ADMIN');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role"
  USING (CASE WHEN "role"::text IN ('USER', 'SELLER') THEN 'CLIENT' ELSE "role"::text END)::"Role";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'CLIENT';
DROP TYPE "Role_old";

-- The "become a seller" application flow is removed: identity is checked by the notary
-- with each listing (ID document + title deed) instead.
DROP TABLE "SellerApplication";
DROP TYPE "SellerApplicationStatus";

DELETE FROM "Notification" WHERE "type"::text IN ('SELLER_APPROVED', 'SELLER_REJECTED');
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
CREATE TYPE "NotificationType" AS ENUM (
  'LAND_SUBMITTED',
  'LAND_APPROVED',
  'LAND_REJECTED',
  'OFFER_RECEIVED',
  'OFFER_ACCEPTED',
  'OFFER_REJECTED',
  'OFFER_WITHDRAWN',
  'TRANSFER_PENDING',
  'TRANSFER_COMPLETED',
  'TRANSFER_CANCELLED',
  'NEW_MESSAGE',
  'NEW_REVIEW',
  'TRANSFER_CLAIMED',
  'PAYMENT_PROOF_SUBMITTED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_REJECTED',
  'TITLE_REGISTERED',
  'SYSTEM'
);
ALTER TABLE "Notification" ALTER COLUMN "type" TYPE "NotificationType" USING ("type"::text)::"NotificationType";
DROP TYPE "NotificationType_old";
