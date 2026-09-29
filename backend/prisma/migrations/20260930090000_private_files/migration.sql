-- Private documents (title deeds, IDs, receipts) are no longer addressed by a public URL but by a
-- storage key; clients get short-lived signed links. Existing files are moved by the API at startup.
ALTER TABLE "LandDocument" RENAME COLUMN "url" TO "storageKey";
ALTER TABLE "TransferStep" RENAME COLUMN "proofUrl" TO "proofKey";
