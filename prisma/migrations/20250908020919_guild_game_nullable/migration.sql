-- DropForeignKey
ALTER TABLE "Guild" DROP CONSTRAINT "Guild_gameId_fkey";

-- AlterTable
ALTER TABLE "Guild" ALTER COLUMN "gameId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Guild" ADD CONSTRAINT "Guild_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;
