-- AlterTable
ALTER TABLE "DeviceState" ADD COLUMN     "connectionStatus" TEXT NOT NULL DEFAULT 'MOCK_OFFLINE',
ADD COLUMN     "deviceIp" TEXT,
ADD COLUMN     "deviceLocation" TEXT,
ADD COLUMN     "deviceMode" TEXT NOT NULL DEFAULT 'MOCK',
ADD COLUMN     "deviceModel" TEXT NOT NULL DEFAULT 'Not configured',
ADD COLUMN     "devicePort" INTEGER NOT NULL DEFAULT 4370,
ADD COLUMN     "lastHeartbeatAt" TIMESTAMP(3),
ADD COLUMN     "realDeviceEnabled" BOOLEAN NOT NULL DEFAULT false;
