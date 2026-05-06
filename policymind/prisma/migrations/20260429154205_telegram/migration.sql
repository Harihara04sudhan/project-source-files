-- CreateTable
CREATE TABLE "TelegramSubscriber" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "subscribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TelegramSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramDraftMessage" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "messageId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramDraftMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramSubscriber_orgId_chatId_key" ON "TelegramSubscriber"("orgId", "chatId");

-- CreateIndex
CREATE INDEX "TelegramDraftMessage_draftId_idx" ON "TelegramDraftMessage"("draftId");

-- CreateIndex
CREATE INDEX "TelegramDraftMessage_chatId_messageId_idx" ON "TelegramDraftMessage"("chatId", "messageId");
