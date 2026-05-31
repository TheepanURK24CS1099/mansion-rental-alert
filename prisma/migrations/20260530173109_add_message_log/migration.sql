-- CreateTable
CREATE TABLE "MessageLog" (
    "id" TEXT NOT NULL,
    "messageType" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "templateVariables" JSONB NOT NULL,
    "messageBody" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "relatedRentalAlertId" TEXT,
    "relatedAttendanceId" TEXT,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageLog_pkey" PRIMARY KEY ("id")
);
