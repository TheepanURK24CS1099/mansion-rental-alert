-- CreateTable
CREATE TABLE "RentalAlert" (
    "id" TEXT NOT NULL,
    "roomType" TEXT NOT NULL,
    "actionLabel" TEXT NOT NULL,
    "deviceUserId" INTEGER NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "messageStatus" TEXT NOT NULL,
    "alertDate" TEXT NOT NULL,
    "alertTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RentalAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL,
    "mansionName" TEXT NOT NULL DEFAULT 'Mansion Rental Alert System',
    "ownerName" TEXT NOT NULL DEFAULT 'Owner',
    "ownerWhatsAppNumber" TEXT NOT NULL DEFAULT '',
    "caretakerName" TEXT NOT NULL DEFAULT 'Caretaker',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceState" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'online',
    "lastSyncAt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceState_pkey" PRIMARY KEY ("id")
);
