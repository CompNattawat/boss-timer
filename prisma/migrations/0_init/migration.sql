-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guild" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "scheduleChannelId" TEXT,
    "scheduleMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Guild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Boss" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "alias" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "respawnHours" INTEGER NOT NULL DEFAULT 0,
    "lastDeathAt" TIMESTAMP(3),
    "nextSpawnAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Boss_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobLog" (
    "id" TEXT NOT NULL,
    "bossId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL,
    "queueJobId" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedRule" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "bossId" TEXT NOT NULL,
    "cron" TEXT NOT NULL,
    "tz" TEXT NOT NULL DEFAULT 'Asia/Bangkok',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "nextPreparedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Game_code_key" ON "Game"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Guild_platform_externalId_key" ON "Guild"("platform", "externalId");

-- CreateIndex
CREATE INDEX "Boss_nextSpawnAt_idx" ON "Boss"("nextSpawnAt");

-- CreateIndex
CREATE UNIQUE INDEX "Boss_gameId_name_key" ON "Boss"("gameId", "name");

-- CreateIndex
CREATE INDEX "JobLog_status_runAt_idx" ON "JobLog"("status", "runAt");

-- CreateIndex
CREATE INDEX "FixedRule_gameId_bossId_idx" ON "FixedRule"("gameId", "bossId");

-- CreateIndex
CREATE UNIQUE INDEX "FixedRule_bossId_cron_tz_key" ON "FixedRule"("bossId", "cron", "tz");

-- AddForeignKey
ALTER TABLE "Guild" ADD CONSTRAINT "Guild_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Boss" ADD CONSTRAINT "Boss_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobLog" ADD CONSTRAINT "JobLog_bossId_fkey" FOREIGN KEY ("bossId") REFERENCES "Boss"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedRule" ADD CONSTRAINT "FixedRule_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedRule" ADD CONSTRAINT "FixedRule_bossId_fkey" FOREIGN KEY ("bossId") REFERENCES "Boss"("id") ON DELETE CASCADE ON UPDATE CASCADE;

