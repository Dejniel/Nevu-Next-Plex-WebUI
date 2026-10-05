-- Schema produced by Prisma 6.2.1 for the previous application models.
-- CreateTable
CREATE TABLE "UserOption" (
    "userUid" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    PRIMARY KEY ("userUid", "key")
);

-- CreateTable
CREATE TABLE "NevuReviewsLocal" (
    "itemID" TEXT NOT NULL,
    "userID" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rating" INTEGER NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "spoilers" BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY ("itemID", "userID"),
    CONSTRAINT "NevuReviewsLocal_userID_fkey" FOREIGN KEY ("userID") REFERENCES "NevuReviewsLocalUsers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NevuReviewsLocalUsers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "username" TEXT NOT NULL,
    "avatar" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "UserOption_userUid_key_key" ON "UserOption"("userUid", "key");

-- CreateIndex
CREATE UNIQUE INDEX "NevuReviewsLocal_itemID_userID_key" ON "NevuReviewsLocal"("itemID", "userID");

-- CreateIndex
CREATE UNIQUE INDEX "NevuReviewsLocalUsers_id_key" ON "NevuReviewsLocalUsers"("id");
