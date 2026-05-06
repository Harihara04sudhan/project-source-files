-- AlterTable
ALTER TABLE "RatifiedPolicy" ADD COLUMN     "armorIntentRef" TEXT,
ADD COLUMN     "armorMerkleRoot" TEXT,
ADD COLUMN     "armorPlanHash" TEXT,
ADD COLUMN     "armorPlanId" TEXT,
ADD COLUMN     "promotionMode" TEXT;
