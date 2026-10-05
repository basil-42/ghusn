-- CreateTable
CREATE TABLE "NotificationAlertState" (
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationAlertState_pkey" PRIMARY KEY ("key")
);
