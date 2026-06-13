import { prisma } from "@/lib/prisma";
import {
  actionTypeToRoomType,
  isRoomActionType,
} from "@/lib/workers";
import {
  createMockRentalAlertMessageLog,
  createMockStaffAttendanceMessageLog,
} from "@/lib/messageService";
import {
  formatIstDate,
  formatTimeIST,
  getMansionDutyStatus,
} from "@/lib/mansionDutyStatus";

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
  dutyStatus: string;
  scanTimeIst: string;
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

export interface DeviceScanDuplicate {
  success: true;
  duplicate: true;
  type: "duplicate";
  message: string;
}

export interface DeviceScanIgnored {
  success: true;
  type: "attendance_limit_reached" | "attendance_ignored" | "ignored";
  message: string;
}

export type DeviceScanResult =
  | DeviceScanSuccessAttendance
  | DeviceScanSuccessRental
  | DeviceScanFailure
  | DeviceScanDuplicate;

// Include ignored/limit result
export type ExtendedDeviceScanResult = DeviceScanResult | DeviceScanIgnored;

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
): Promise<ExtendedDeviceScanResult> {
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
      // Create DeviceScanLog with processingStatus = FAILED, resultType = UNKNOWN
      await prisma.deviceScanLog.create({
        data: {
          deviceUserId: input.deviceUserId,
          scanTime: input.scanTime ? input.scanTime : new Date(),
          source: input.source,
          processingStatus: "FAILED",
          resultType: "UNKNOWN",
          errorMessage: "Unknown Device User ID.",
        },
      });

      return {
        success: false,
        type: "UNKNOWN",
        error: "Unknown Device User ID.",
      };
    }

    // 2. Check worker status ──────────────────────────────────────────────────
    if (!mapping.worker.isActive) {
      // Create DeviceScanLog with processingStatus = FAILED, resultType = INACTIVE_WORKER
      await prisma.deviceScanLog.create({
        data: {
          deviceUserId: input.deviceUserId,
          workerId: mapping.workerId,
          workerName: mapping.worker.name,
          actionType: mapping.actionType,
          scanTime: input.scanTime ? input.scanTime : new Date(),
          source: input.source,
          processingStatus: "FAILED",
          resultType: "INACTIVE_WORKER",
          errorMessage: "Worker is inactive.",
        },
      });

      return {
        success: false,
        type: "INACTIVE_WORKER",
        error: "Worker is inactive.",
      };
    }

    // 3. Resolve scan timestamp ───────────────────────────────────────────────
    const now = input.scanTime ? input.scanTime.getTime() : Date.now();
    const currentScanTime = new Date(now);
    const parts = formatDateParts(now);
    const source = input.source;

    // 3.5 Check for duplicate scans within 30 seconds ─────────────────────────
    const thirtySecondsAgo = new Date(now - 30 * 1000);
    const latestProcessedScan = await prisma.deviceScanLog.findFirst({
      where: {
        deviceUserId: input.deviceUserId,
        processingStatus: "PROCESSED",
        scanTime: {
          gte: thirtySecondsAgo,
          lte: currentScanTime,
        },
      },
      orderBy: {
        scanTime: "desc",
      },
    });

    if (latestProcessedScan) {
      // Create DeviceScanLog with processingStatus = IGNORED_DUPLICATE
      await prisma.deviceScanLog.create({
        data: {
          deviceUserId: input.deviceUserId,
          workerId: mapping.workerId,
          workerName: mapping.worker.name,
          actionType: mapping.actionType,
          scanTime: currentScanTime,
          source,
          processingStatus: "IGNORED_DUPLICATE",
          resultType: latestProcessedScan.resultType,
          duplicateOfId: latestProcessedScan.id,
        },
      });

      return {
        success: true,
        duplicate: true,
        type: "duplicate",
        message: "Duplicate scan ignored.",
      };
    }

    // 4. Fetch owner WhatsApp number ──────────────────────────────────────────
    const settings = await prisma.appSettings.findFirst({
      orderBy: { createdAt: "asc" },
    });
    const ownerWhatsAppNumber = settings?.ownerWhatsAppNumber?.trim() ?? "";

    // ── ATTENDANCE path ──────────────────────────────────────────────────────
    if (mapping.actionType === "ATTENDANCE") {
      if (mapping.worker.personType !== "ATTENDANCE_AND_ROOM") {
        await prisma.deviceScanLog.create({
          data: {
            deviceUserId: mapping.deviceUserId,
            workerId: mapping.workerId,
            workerName: mapping.worker.name,
            actionType: mapping.actionType,
            scanTime: currentScanTime,
            source,
            processingStatus: "FAILED",
            resultType: "INVALID_ACTION",
            errorMessage: "Attendance mapping is invalid for this worker.",
          },
        });

        return {
          success: false,
          type: "INVALID_MAPPING",
          error: "Attendance mapping is invalid for this worker.",
        };
      }

      const attendanceDateIst = formatIstDate(currentScanTime);
      const attendanceTimeIst = formatTimeIST(currentScanTime);

      const sameDayCount = await prisma.workerAttendance.count({
        where: {
          workerId: mapping.workerId,
          attendanceDate: attendanceDateIst,
        },
      });

      // Enforce limit: allow only first IN and second OUT per IST date.
      if (sameDayCount >= 2) {
        // Log the ignored attendance scan but do not create a WorkerAttendance
        // record or send any message logs.
        await prisma.deviceScanLog.create({
          data: {
            deviceUserId: input.deviceUserId,
            workerId: mapping.workerId,
            workerName: mapping.worker.name,
            actionType: mapping.actionType,
            scanTime: currentScanTime,
            source,
            processingStatus: "PROCESSED",
            resultType: "ATTENDANCE_IGNORED",
            errorMessage: "Daily IN/OUT already completed.",
          },
        });

        return {
          success: true,
          type: "attendance_limit_reached",
          message: "Daily IN/OUT already completed.",
        } as DeviceScanIgnored;
      }

      const nextStatus = sameDayCount % 2 === 0 ? "IN" : "OUT";
      const dutyStatus = getMansionDutyStatus(mapping.worker.name, currentScanTime);

      const attendance = await prisma.workerAttendance.create({
        data: {
          workerId: mapping.workerId,
          deviceUserId: mapping.deviceUserId,
          status: nextStatus,
          attendanceDate: attendanceDateIst,
          attendanceTime: attendanceTimeIst,
          source,
        },
      });

      try {
        console.log({
          event: "attendance_duty_status",
          workerName: mapping.worker.name,
          attendanceStatus: attendance.status,
          dutyStatus,
          scanTimeIst: attendanceTimeIst,
          source,
        });

        if (ownerWhatsAppNumber.length > 0) {
          await createMockStaffAttendanceMessageLog({
            recipient: ownerWhatsAppNumber,
            workerName: mapping.worker.name,
            status: attendance.status,
            attendanceDate: attendanceDateIst,
            attendanceTime: attendanceTimeIst,
            dutyStatus,
            relatedAttendanceId: attendance.id,
          });
        } else {
          await createMockStaffAttendanceMessageLog({
            recipient: "Not configured",
            workerName: mapping.worker.name,
            status: attendance.status,
            attendanceDate: attendanceDateIst,
            attendanceTime: attendanceTimeIst,
            dutyStatus,
            relatedAttendanceId: attendance.id,
            messageStatus: "FAILED",
            errorMessage: "Owner WhatsApp number not configured.",
          });
        }
      } catch {
        // Message logging must never block attendance creation.
      }

      // Create DeviceScanLog with processingStatus = PROCESSED, resultType = ATTENDANCE
      await prisma.deviceScanLog.create({
        data: {
          deviceUserId: mapping.deviceUserId,
          workerId: mapping.workerId,
          workerName: mapping.worker.name,
          actionType: mapping.actionType,
          scanTime: currentScanTime,
          source,
          processingStatus: "PROCESSED",
          resultType: "ATTENDANCE",
          relatedAttendanceId: attendance.id,
        },
      });

      return {
        success: true,
        type: "attendance",
        workerName: mapping.worker.name,
        status: attendance.status,
        dutyStatus,
        scanTimeIst: attendanceTimeIst,
        attendanceId: attendance.id,
      };
    }

    // ── RENTAL path ──────────────────────────────────────────────────────────
    if (!isRoomActionType(mapping.actionType)) {
      await prisma.deviceScanLog.create({
        data: {
          deviceUserId: mapping.deviceUserId,
          workerId: mapping.workerId,
          workerName: mapping.worker.name,
          actionType: mapping.actionType,
          scanTime: currentScanTime,
          source,
          processingStatus: "FAILED",
          resultType: "INVALID_ACTION",
          errorMessage: "Unsupported action type.",
        },
      });

      return {
        success: false,
        type: "UNSUPPORTED_ACTION",
        error: "Unsupported action type.",
      };
    }

    const roomType = actionTypeToRoomType(mapping.actionType);

    if (!roomType) {
      await prisma.deviceScanLog.create({
        data: {
          deviceUserId: mapping.deviceUserId,
          workerId: mapping.workerId,
          workerName: mapping.worker.name,
          actionType: mapping.actionType,
          scanTime: currentScanTime,
          source,
          processingStatus: "FAILED",
          resultType: "INVALID_ACTION",
          errorMessage: "Unsupported room type.",
        },
      });

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
        // Use the actual scanned deviceUserId and source from the input
        deviceUserId: input.deviceUserId,
        updatedBy: mapping.worker.name,
        source: input.source,
        messageStatus: "Mock Sent",
        alertDate: (function formatIstDateIso(scanTime: Date) {
          return scanTime.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        })(currentScanTime),
        alertTime: formatTimeIST(currentScanTime),
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

    // Create DeviceScanLog with processingStatus = PROCESSED, resultType = RENTAL
    await prisma.deviceScanLog.create({
      data: {
        // Log the actual scanned deviceUserId and source so records reflect the
        // real device input rather than the mapping defaults used elsewhere.
        deviceUserId: input.deviceUserId,
        workerId: mapping.workerId,
        workerName: mapping.worker.name,
        actionType: mapping.actionType,
        scanTime: currentScanTime,
        source: input.source,
        processingStatus: "PROCESSED",
        resultType: "RENTAL",
        relatedRentalAlertId: rentalAlert.id,
      },
    });

    return {
      success: true,
      type: "rental",
      workerName: mapping.worker.name,
      roomType: rentalAlert.roomType,
      rentalAlertId: rentalAlert.id,
    };
  } catch (err) {
    try {
      await prisma.deviceScanLog.create({
        data: {
          deviceUserId: input.deviceUserId,
          scanTime: input.scanTime ? input.scanTime : new Date(),
          source: input.source,
          processingStatus: "FAILED",
          resultType: "UNKNOWN",
          errorMessage: err instanceof Error ? err.message : "Unable to process device scan.",
        },
      });
    } catch {
      // Don't crash if logging fails
    }
    return {
      success: false,
      type: "ERROR",
      error: "Unable to process device scan.",
    };
  }
}

