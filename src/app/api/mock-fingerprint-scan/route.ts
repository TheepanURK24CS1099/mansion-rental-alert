import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  actionTypeToRoomType,
  isRoomActionType,
} from "@/lib/workers";
import {
  createMockRentalAlertMessageLog,
  createMockStaffAttendanceMessageLog,
} from "@/lib/messageService";

interface MockFingerprintScanPayload {
  deviceUserId?: unknown;
  source?: unknown;
}

function isDeviceUserId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

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

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();

    if (typeof body !== "object" || body === null) {
      return NextResponse.json(
        { success: false, error: "Invalid request body." },
        { status: 400 },
      );
    }

    const payload = body as MockFingerprintScanPayload;

    if (!isDeviceUserId(payload.deviceUserId)) {
      return NextResponse.json(
        { success: false, error: "deviceUserId must be a number." },
        { status: 400 },
      );
    }

    const mapping = await prisma.workerFingerMapping.findUnique({
      where: {
        deviceUserId: payload.deviceUserId,
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
      return NextResponse.json(
        { success: false, error: "Unknown Device User ID." },
        { status: 404 },
      );
    }

    if (!mapping.worker.isActive) {
      return NextResponse.json(
        { success: false, error: "Worker is inactive." },
        { status: 403 },
      );
    }

    const now = Date.now();
    const parts = formatDateParts(now);
    const source =
      typeof payload.source === "string" && payload.source.trim().length > 0
        ? payload.source
        : "Mock Device Scan";

    const settings = await prisma.appSettings.findFirst({
      orderBy: { createdAt: "asc" },
    });
    const ownerWhatsAppNumber = settings?.ownerWhatsAppNumber?.trim() ?? "";

    if (mapping.actionType === "ATTENDANCE") {
      if (mapping.worker.personType !== "ATTENDANCE_AND_ROOM") {
        return NextResponse.json(
          { success: false, error: "Attendance mapping is invalid for this worker." },
          { status: 400 },
        );
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

      return NextResponse.json({
        success: true,
        type: "attendance",
        status: attendance.status,
        workerName: mapping.worker.name,
      });
    }

    if (!isRoomActionType(mapping.actionType)) {
      return NextResponse.json(
        { success: false, error: "Unsupported action type." },
        { status: 400 },
      );
    }

    const roomType = actionTypeToRoomType(mapping.actionType);

    if (!roomType) {
      return NextResponse.json(
        { success: false, error: "Unsupported room type." },
        { status: 400 },
      );
    }

    const rentalAlert = await prisma.rentalAlert.create({
      data: {
        roomType,
        actionLabel: `${roomType} Rented`,
        deviceUserId: payload.deviceUserId,
        updatedBy: mapping.worker.name,
        source: "Mock Device Scan",
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

    return NextResponse.json({
      success: true,
      type: "rental",
      roomType: rentalAlert.roomType,
      workerName: mapping.worker.name,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Unable to process mock scan." },
      { status: 500 },
    );
  }
}
