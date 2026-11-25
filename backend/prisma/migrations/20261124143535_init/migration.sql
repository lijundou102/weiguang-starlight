-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Star" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "aiReply" TEXT,
    "emotion" TEXT NOT NULL,
    "colorHex" TEXT NOT NULL,
    "themeTag" TEXT NOT NULL,
    "posX" REAL NOT NULL,
    "posY" REAL NOT NULL,
    "posZ" REAL NOT NULL,
    "lightCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "constellationId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Star_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Star_constellationId_fkey" FOREIGN KEY ("constellationId") REFERENCES "Constellation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Constellation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "themeTag" TEXT NOT NULL,
    "story" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Encouragement" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "starId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "presetText" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Encouragement_starId_fkey" FOREIGN KEY ("starId") REFERENCES "Star" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Encouragement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MicroAction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "activeDate" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserMicroAction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "actionId" INTEGER NOT NULL,
    "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "starId" INTEGER,
    CONSTRAINT "UserMicroAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserMicroAction_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "MicroAction" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserMicroAction_starId_fkey" FOREIGN KEY ("starId") REFERENCES "Star" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "Star_status_createdAt_idx" ON "Star"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Star_userId_idx" ON "Star"("userId");

-- CreateIndex
CREATE INDEX "Star_constellationId_idx" ON "Star"("constellationId");

-- CreateIndex
CREATE UNIQUE INDEX "Constellation_themeTag_key" ON "Constellation"("themeTag");

-- CreateIndex
CREATE UNIQUE INDEX "Encouragement_starId_userId_key" ON "Encouragement"("starId", "userId");

-- CreateIndex
CREATE INDEX "MicroAction_activeDate_idx" ON "MicroAction"("activeDate");

-- CreateIndex
CREATE UNIQUE INDEX "UserMicroAction_starId_key" ON "UserMicroAction"("starId");

-- CreateIndex
CREATE UNIQUE INDEX "UserMicroAction_userId_actionId_key" ON "UserMicroAction"("userId", "actionId");
