import { prisma } from "@/lib/prisma";
import {
  actionTypeToRoomType,
  isRoomActionType,
} from "@/lib/workers";
import {
  createMockRentalAlertMessageLog,
  createMockStaffAttendanceMessageLog,
} from "@/lib/messageService";

// ─── Input / Output Types ────────────────────────────────────────────────────

export interface DeviceScanInput {
  deviceUserId: number;
  scanTime?: Date;
  source: string;
}

export interface DeviceScanSuccessAttendance {
  success: true;
  type: "attendance";
  workerName: string;
  status: string;
  attendanceId: string;
}

export interface DeviceScanSuccessRental {
  success: true;
  type: "rental";
  workerName: string;
  roomType: string;
  rentalAlertId: string;
}

export interface DeviceScanFailure {
  success: false;
  type: "UNKNOWN" | "INACTIVE_WORKER" | "INVALID_MAPPING" | "UNSUPPORTED_ACTION" | "ERROR";
  error: string;
}

export type DeviceScanResult =
  | DeviceScanSuccessAttendance
  | DeviceScanSuccessRental
  | DeviceScanFailure;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateParts(timestamp: number): { date: string; time: string } {
  const dateObject = new Date(timestamp);

  return {
    date: dateObject.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    time: dateObject.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
}

// ─── Main Processor ──────────────────────────────────────────────────────────

/**
 * Shared scan processor used by both mock fingerprint scan and future real
 * biometric device integrations.  All scan-to-action logic lives here so that
 * adding a real device later requires no duplication.
 */
export async function processDeviceScan(
  input: DeviceScanInput,
): Promise<DeviceScanResult> {
  try {
    // 1. Look up the mapping ──────────────────────────────────────────────────
    const mapping = await prisma.workerFingerMapping.findUnique({
      where: {
        deviceUserId: input.deviceUserId,
      },
      include: {
        worker: {
          include: {
            attendanceLogs: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    if (!mapping) {
      return {
        success: false,
        type: "UNKNOWN",
        error: "Unknown Device User ID.",
      };
    }

    // 2. Check worker status ──────────────────────────────────────────────────
    if (!mapping.worker.isActive) {
      return {
        success: false,
        type: "INACTIVE_WORKER",
        error: "Worker is inactive.",
      };
    }

    // 3. Resolve scan timestamp ───────────────────────────────────────────────
    const now = input.scanTime ? input.scanTime.getTime() : Date.now();
    const parts = formatDateParts(now);
    const source = input.source;

    // 4. Fetch owner WhatsApp number ──────────────────────────────────────────
    const settings = await prisma.appSettings.findFirst({
      orderBy: { createdAt: "asc" },
    });
    const ownerWhatsAppNumber = settings?.ownerWhatsAppNumber?.trim() ?? "";

    // ── ATTENDANCE path ──────────────────────────────────────────────────────
    if (mapping.actionType === "ATTENDANCE") {
      if (mapping.worker.personType !== "ATTENDANCE_AND_ROOM") {
        return {
          success: false,
          type: "INVALID_MAPPING",
          error: "Attendance mapping is invalid for this worker.",
        };
      }

      const latestAttendance = mapping.worker.attendanceLogs[0];
      const nextStatus = latestAttendance?.status === "IN" ? "OUT" : "IN";

      const attendance = await prisma.workerAttendance.create({
        data: {
          workerId: mapping.workerId,
          deviceUserId: mapping.deviceUserId,
          status: nextStatus,
          attendanceDate: parts.date,
          attendanceTime: parts.time,
          source,
        },
      });

      try {
        if (ownerWhatsAppNumber.length > 0) {
          await createMockStaffAttendanceMessageLog({
            recipient: ownerWhatsAppNumber,
            workerName: mapping.worker.name,
            status: attendance.status,
            attendanceDate: attendance.attendanceDate,
            attendanceTime: attendance.attendanceTime,
            relatedAttendanceId: attendance.id,
          });
        } else {
          await createMockStaffAttendanceMessageLog({
            recipient: "Not configured",
            workerName: mapping.worker.name,
            status: attendance.status,
            attendanceDate: attendance.attendanceDate,
            attendanceTime: attendance.attendanceTime,
            relatedAttendanceId: attendance.id,
            messageStatus: "FAILED",
            errorMessage: "Owner WhatsApp number not configured.",
          });
        }
      } catch {
        // Message logging must never block attendance creation.
      }

      return {
        success: true,
        type: "attendance",
        workerName: mapping.worker.name,
        status: attendance.status,
        attendanceId: attendance.id,
      };
    }

    // ── RENTAL path ──────────────────────────────────────────────────────────
    if (!isRoomActionType(mapping.actionType)) {
      return {
        success: false,
        type: "UNSUPPORTED_ACTION",
        error: "Unsupported action type.",
      };
    }

    const roomType = actionTypeToRoomType(mapping.actionType);

    if (!roomType) {
      return {
        success: false,
        type: "UNSUPPORTED_ACTION",
        error: "Unsupported room type.",
      };
    }

    const rentalAlert = await prisma.rentalAlert.create({
      data: {
        roomType,
        actionLabel: `${roomType} Rented`,
        deviceUserId: input.deviceUserId,
        updatedBy: mapping.worker.name,
        source,
        messageStatus: "Mock Sent",
        alertDate: parts.date,
        alertTime: parts.time,
      },
    });

    try {
      if (ownerWhatsAppNumber.length > 0) {
        await createMockRentalAlertMessageLog({
          recipient: ownerWhatsAppNumber,
          roomType: rentalAlert.roomType,
          alertDate: rentalAlert.alertDate,
          alertTime: rentalAlert.alertTime,
          updatedBy: mapping.worker.name,
          relatedRentalAlertId: rentalAlert.id,
        });
      } else {
        await createMockRentalAlertMessageLog({
          recipient: "Not configured",
          roomType: rentalAlert.roomType,
          alertDate: rentalAlert.alertDate,
          alertTime: rentalAlert.alertTime,
          updatedBy: mapping.worker.name,
          relatedRentalAlertId: rentalAlert.id,
          status: "FAILED",
          errorMessage: "Owner WhatsApp number not configured.",
        });
      }
    } catch {
      // Message logging must never block rental creation.
    }

    return {
      success: true,
      type: "rental",
      workerName: mapping.worker.name,
      roomType: rentalAlert.roomType,
      rentalAlertId: rentalAlert.id,
    };
  } catch {
    return {
      success: false,
      type: "ERROR",
      error: "Unable to process device scan.",
    };
  }
}
