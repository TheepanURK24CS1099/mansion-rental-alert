-- CreateTable
CREATE TABLE "DeviceScanLog" (
    "id" TEXT NOT NULL,
    "deviceUserId" INTEGER NOT NULL,
    "workerId" TEXT,
    "workerName" TEXT,
    "actionType" TEXT,
    "scanTime" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "processingStatus" TEXT NOT NULL,
    "resultType" TEXT,
    "relatedAttendanceId" TEXT,
    "relatedRentalAlertId" TEXT,
    "duplicateOfId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceScanLog_pkey" PRIMARY KEY ("id")
);
