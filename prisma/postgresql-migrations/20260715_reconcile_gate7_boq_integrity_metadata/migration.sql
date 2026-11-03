-- AlterTable
ALTER TABLE "ProjectBOQVersion" ADD COLUMN     "checksum" TEXT,
ADD COLUMN     "checksumAlgorithm" TEXT,
ADD COLUMN     "checksumVersion" TEXT,
ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "lockedById" TEXT,
ADD COLUMN     "sourceProvenance" TEXT;
