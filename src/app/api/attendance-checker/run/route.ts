import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createMockStaffAttendanceMessageLog } from "@/lib/messageService";
import {
  evaluateAttendanceStatus,
  getCurrentAttendanceTime,
  getTodayAttendanceDate,
} from "@/lib/attendanceChecker";

function normalizeWorkerName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function hasDuplicateAttendanceAlert(
  existingLogs: Array<{ templateVariables?: unknown }>,
  workerName: string,
  attendanceDate: string,
  status: string,
): boolean {
  return existingLogs.some((log) => {
    const vars = (log.templateVariables ?? {}) as {
      workerName?: unknown;
      attendanceDate?: unknown;
      status?: unknown;
    };

    return (
      vars.workerName === workerName &&
      vars.attendanceDate === attendanceDate &&
      vars.status === status
    );
  });
}

export async function POST(req: Request) {
  try {
    // Security: if ATTENDANCE_CHECKER_SECRET is set in env, require the
    // x-attendance-checker-secret header to match. When not set, allow
    // requests for local development/testing.
    const requiredSecret = process.env.ATTENDANCE_CHECKER_SECRET;
    if (requiredSecret) {
      const provided = req.headers.get("x-attendance-checker-secret")?.trim() ?? "";
      if (!provided || provided !== requiredSecret) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
      }
    }
    const url = new URL(req.url);
    const dateParam = url.searchParams.get("date"); // YYYY-MM-DD
    const timeParam = url.searchParams.get("time"); // HH:mm

    // Build IST-based now for testing when date/time provided.
    let checkedAt: Date;

    if (dateParam || timeParam) {
      // Determine IST date part (use current IST date if date not provided)
      const istTodayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
      const datePart = dateParam ?? istTodayIso; // YYYY-MM-DD
      const istNowTime = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date());
      const timePart = timeParam ?? istNowTime; // HH:mm

      // Construct an ISO with IST offset (+05:30) so Date parses it correctly as that IST moment.
      const iso = `${datePart}T${timePart}:00+05:30`;
      checkedAt = new Date(iso);
    } else {
      checkedAt = new Date();
    }

    const attendanceDate = getTodayAttendanceDate(checkedAt);

    // Compute start/end of that IST date for message logs filtering
    const datePartForRange = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(checkedAt);
    const startOfTodayIst = new Date(`${datePartForRange}T00:00:00+05:30`);
    const endOfTodayIst = new Date(`${datePartForRange}T23:59:59.999+05:30`);

    const [workers, attendanceLogs, settings] = await Promise.all([
      prisma.worker.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
      }),
      prisma.workerAttendance.findMany({
        where: { attendanceDate },
        include: { worker: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.appSettings.findFirst(),
    ]);

    const scheduleNames = new Set([
      "ananthi",
      "suresh kumar",
      "periyaanna",
    ]);

    const results: Array<{
      workerName: string;
      status: string;
      attendanceDate: string;
      attendanceTime: string;
      dutyStatus: string;
      reason: string;
      duplicate: boolean;
    }> = [];

    const ownerWhatsAppNumber = settings?.ownerWhatsAppNumber?.trim() ?? "";

    for (const worker of workers) {
      if (!scheduleNames.has(normalizeWorkerName(worker.name))) {
        continue;
      }

      const workerAttendance = attendanceLogs.filter((record) => record.workerId === worker.id);
      const evaluation = evaluateAttendanceStatus(worker.name, workerAttendance, checkedAt);

      if (!evaluation) {
        continue;
      }

      // Ensure there is no existing message for same worker + attendanceDate + status
      const existing = await prisma.messageLog.findFirst({
        where: {
          messageType: "STAFF_ATTENDANCE",
          AND: [
            { templateVariables: { path: ["workerName"], equals: worker.name } },
            { templateVariables: { path: ["attendanceDate"], equals: evaluation.attendanceDate } },
            { templateVariables: { path: ["status"], equals: evaluation.status } },
          ],
        },
      });

      const duplicate = !!existing;

      results.push({
        workerName: worker.name,
        status: evaluation.status,
        attendanceDate: evaluation.attendanceDate,
        attendanceTime: evaluation.attendanceTime,
        dutyStatus: evaluation.dutyStatus,
        reason: evaluation.reason,
        duplicate,
      });

      if (!duplicate) {
        await createMockStaffAttendanceMessageLog({
          recipient: ownerWhatsAppNumber,
          workerName: worker.name,
          status: evaluation.status,
          attendanceDate: evaluation.attendanceDate,
          attendanceTime: evaluation.attendanceTime,
          dutyStatus: evaluation.dutyStatus,
          messageStatus: "MOCK_SENT",
        });
      }
    }

    return NextResponse.json({
      success: true,
      attendanceDate,
      checkedAt: checkedAt.toISOString(),
      currentAttendanceTime: getCurrentAttendanceTime(checkedAt),
      results,
      createdCount: results.filter((result) => !result.duplicate).length,
    });
  } catch (error) {
    console.error("POST /api/attendance-checker/run error:", error);
    return NextResponse.json(
      { success: false, error: "Unable to run attendance checker." },
      { status: 500 },
    );
  }
}
